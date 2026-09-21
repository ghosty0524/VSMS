// server/src/lib/orgSync/pull.ts
// 備援路徑：啟動時向 vauth 拉一次全量快照。失敗只記 log，不阻擋啟動。
import { validateSnapshot, type OrgSnapshot } from './types.js'
import { syncVsmsOrg } from './apply.js'

export async function pullOrgSnapshotAtStartup(deps: { fetchFn?: typeof fetch } = {}): Promise<void> {
  const key = process.env.VAUTH_SERVICE_KEY?.trim() ?? ''
  if (process.env.AUTH_PROVIDER !== 'vauth' || !key) return
  const base = process.env.VAUTH_URL?.trim() || 'http://127.0.0.1:4100'
  const fetchFn = deps.fetchFn ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetchFn(`${base}/auth/org/snapshot`, { headers: { 'X-Service-Key': key }, signal: controller.signal })
    if (!res.ok) { console.error(`[orgSync] startup pull failed: vauth ${res.status}`); return }
    const body = await res.json()
    const problem = validateSnapshot(body)
    if (problem) { console.error(`[orgSync] startup pull got invalid snapshot: ${problem}`); return }
    await syncVsmsOrg(body as OrgSnapshot, { dryRun: false })
  } catch (err) {
    console.error('[orgSync] startup pull failed:', err)
  } finally {
    clearTimeout(timer)
  }
}
