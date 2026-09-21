// 平台通知寄送層的 client。站內通知與 email 都從這裡送；規則（要通知誰、什麼時候）留在呼叫端。

export type Recipient = { userId: string } | { email: string } | { username: string }
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

/**
 * 平台通知功能是否已連接。兩個環境變數缺一不可 —— deliver() 兩者任一沒設
 * 都會 drop，呼叫端（路由的存在性檢查、啟動時的 cron 閘門）不能只看
 * NOTIFY_URL，否則會出現「閘門說已連接、deliver() 卻整批 drop」的不一致。
 */
export function notifyConfigured(): boolean {
  return !!notifyUrl() && !!serviceKey()
}

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

// ids 塞進查詢字串一次送出：500 個 id（每個 UUID 長度）會讓 URL 超過
// Node 預設的 16 KB header 限制，被伺服器回 431 整批查詢失敗。分批送出，
// 一批失敗只影響那一批查不到的 id，不拖垮其他批。
const STATUS_CHUNK_SIZE = 200

export async function fetchDeliveryStatuses(ids: string[], deps: { fetchFn?: typeof fetch } = {}): Promise<Map<string, { status: string; lastError: string | null; sentAt: string | null }>> {
  const out = new Map<string, { status: string; lastError: string | null; sentAt: string | null }>()
  if (!ids.length || !notifyUrl() || !serviceKey()) return out
  const fetchFn = deps.fetchFn ?? fetch
  for (let i = 0; i < ids.length; i += STATUS_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + STATUS_CHUNK_SIZE)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetchFn(`${notifyUrl()}/notify/deliveries?ids=${encodeURIComponent(chunk.join(','))}&limit=500`, {
        headers: { 'X-Service-Key': serviceKey() },
        signal: controller.signal,
      })
      if (!res.ok) continue
      const data = await res.json() as { deliveries: { id: string; mail: { status: string; lastError: string | null; sentAt: string | null }[] }[] }
      for (const d of data.deliveries) { const m = d.mail[0]; if (m) out.set(d.id, { status: m.status, lastError: m.lastError, sentAt: m.sentAt }) }
    } catch (err) {
      console.warn('[notify] fetchDeliveryStatuses failed:', err)
    } finally {
      clearTimeout(timer)
    }
  }
  return out
}
