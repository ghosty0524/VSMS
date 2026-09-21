// 平台通知寄送層的 client。站內通知與 email 都從這裡送；規則（要通知誰、什麼時候）留在呼叫端。

export type Recipient = { userId: string } | { email: string }
export interface DeliverInput {
  key: string
  channels: Array<'inapp' | 'email'>
  recipients: Recipient[]
  cc?: Recipient[]
  severity: string
  title: string
  body: string
  linkUrl?: string
  onDuplicate?: 'ignore' | 'update' | 'renotify'
  mail?: { subject?: string; text?: string; html?: string }
}
export interface DeliverResult { id: string | null; deduped: boolean; dropped: boolean; mail?: { queued: boolean; unresolved: string[] } }

const notifyUrl = () => process.env.NOTIFY_URL?.trim() ?? ''
const serviceKey = () => process.env.VAUTH_SERVICE_KEY?.trim() ?? ''

export async function deliver(input: DeliverInput, deps: { fetchFn?: typeof fetch } = {}): Promise<DeliverResult> {
  if (!notifyUrl() || !serviceKey()) {
    console.warn(`[notify] client unset, dropped ${input.key}`)
    return { id: null, deduped: false, dropped: true }
  }
  const fetchFn = deps.fetchFn ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetchFn(`${notifyUrl()}/notify/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': serviceKey() },
      body: JSON.stringify({ source: 'vsms', linkUrl: '', ...input }),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({})) as { id?: string; deduped?: boolean; mail?: { queued: boolean; unresolved: string[] }; error?: { code?: string; message?: string } }
    if (!res.ok) throw new Error(`notify ${res.status} ${data.error?.code ?? ''}: ${data.error?.message ?? ''}`)
    return { id: data.id ?? null, deduped: data.deduped === true, dropped: false, ...(data.mail ? { mail: data.mail } : {}) }
  } finally {
    clearTimeout(timer)
  }
}

export interface Deliverer { deliver(input: DeliverInput): Promise<DeliverResult> }
export const platformDeliverer: Deliverer = { deliver }

export async function fetchDeliveryStatuses(ids: string[], deps: { fetchFn?: typeof fetch } = {}): Promise<Map<string, { status: string; lastError: string | null; sentAt: string | null }>> {
  const out = new Map<string, { status: string; lastError: string | null; sentAt: string | null }>()
  if (!ids.length || !notifyUrl() || !serviceKey()) return out
  const fetchFn = deps.fetchFn ?? fetch
  try {
    const res = await fetchFn(`${notifyUrl()}/notify/deliveries?ids=${encodeURIComponent(ids.join(','))}&limit=500`, { headers: { 'X-Service-Key': serviceKey() } })
    if (!res.ok) return out
    const data = await res.json() as { deliveries: { id: string; mail: { status: string; lastError: string | null; sentAt: string | null }[] }[] }
    for (const d of data.deliveries) { const m = d.mail[0]; if (m) out.set(d.id, { status: m.status, lastError: m.lastError, sentAt: m.sentAt }) }
  } catch (err) {
    console.warn('[notify] fetchDeliveryStatuses failed:', err)
  }
  return out
}
