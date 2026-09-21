import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
const { syncSpy } = vi.hoisted(() => ({ syncSpy: vi.fn() }))
vi.mock('../lib/db.js', () => ({ prisma: {} }))
vi.mock('../lib/orgSync/apply.js', () => ({ syncVsmsOrg: syncSpy }))
import internalRouter from '../routes/internal.js'
import { fixtureSnapshot } from '../lib/orgSync/fixture.js'

const KEY = 'test-integration-key'
process.env.INTEGRATION_API_KEY = KEY
function app() { const a = express(); a.use(express.json()); a.use('/api/internal', internalRouter); return a }
// key 用 `string | null`（不是 `| undefined`）：JS 的預設參數在收到明確傳入的
// `undefined` 時仍會套用預設值，所以「不帶 key」這個情境必須用 null 當哨兵，
// 否則「沒有 key → 401」那筆測試會悄悄帶著 KEY 送出，永遠測不到 401 分支。
const post = (body: unknown, query = '', key: string | null = KEY) => {
  const r = request(app()).post('/api/internal/org-sync' + query)
  return (key ? r.set('X-Api-Key', key) : r).send(body as object)
}
beforeEach(() => { vi.clearAllMocks(); syncSpy.mockResolvedValue({ ok: true, version: 1, dryRun: false, plan: {}, applied: {} }) })

describe('POST /api/internal/org-sync', () => {
  it('沒有 key → 401', async () => { expect((await post(fixtureSnapshot(), '', null)).status).toBe(401); expect(syncSpy).not.toHaveBeenCalled() })
  it('units 空 → 400', async () => { expect((await post({ ...fixtureSnapshot(), units: [] })).status).toBe(400) })
  it('正常 → 200 並以 dryRun=false 呼叫', async () => {
    const res = await post(fixtureSnapshot(7))
    expect(res.status).toBe(200)
    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ version: 7 }), { dryRun: false })
  })
  it('dryRun=1', async () => { await post(fixtureSnapshot(), '?dryRun=1'); expect(syncSpy).toHaveBeenCalledWith(expect.anything(), { dryRun: true }) })
})
