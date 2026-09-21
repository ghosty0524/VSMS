import { describe, it, expect, vi, beforeEach } from 'vitest'
const { syncSpy } = vi.hoisted(() => ({ syncSpy: vi.fn() }))
vi.mock('../lib/orgSync/apply.js', () => ({ syncVsmsOrg: syncSpy }))
import { pullOrgSnapshotAtStartup } from '../lib/orgSync/pull.js'
import { fixtureSnapshot } from '../lib/orgSync/fixture.js'

beforeEach(() => { vi.clearAllMocks(); process.env.AUTH_PROVIDER = 'vauth'; process.env.VAUTH_URL = 'http://127.0.0.1:4100'; process.env.VAUTH_SERVICE_KEY = 'k' })

describe('pullOrgSnapshotAtStartup', () => {
  it('vauth 模式：帶 X-Service-Key 拉 /auth/org/snapshot 並套用', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(fixtureSnapshot(3)), { status: 200 }))
    await pullOrgSnapshotAtStartup({ fetchFn: fetchFn as unknown as typeof fetch })
    expect(fetchFn).toHaveBeenCalledWith('http://127.0.0.1:4100/auth/org/snapshot', expect.objectContaining({ headers: { 'X-Service-Key': 'k' } }))
    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }), { dryRun: false })
  })
  it('local 模式或沒 key：不拉', async () => {
    const fetchFn = vi.fn()
    process.env.AUTH_PROVIDER = 'local'
    await pullOrgSnapshotAtStartup({ fetchFn: fetchFn as unknown as typeof fetch })
    process.env.AUTH_PROVIDER = 'vauth'; process.env.VAUTH_SERVICE_KEY = ''
    await pullOrgSnapshotAtStartup({ fetchFn: fetchFn as unknown as typeof fetch })
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('連不上不丟例外', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    await expect(pullOrgSnapshotAtStartup({ fetchFn: fetchFn as unknown as typeof fetch })).resolves.toBeUndefined()
  })
})
