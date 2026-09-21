// 不碰真 DB：用記憶體假 prisma 驗證 apply 寫了什麼、以及同一快照套兩次第二次零變更。
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 的 factory 會被 hoist 到檔案最上方（比 import 更早執行），
// factory 裡引用的變數也必須放進 vi.hoisted，否則會出現
// "Cannot access '...' before initialization"。
const { state, fakePrisma } = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = { testUnit: [] as Row[], engineer: [] as Row[], user: [] as Row[] }
  function table(name: keyof typeof state) {
    const rows = () => state[name]
    return {
      findMany: async (q?: { select?: Row; where?: Row }) => rows().filter(r => !q?.where || Object.entries(q.where).every(([k, v]) => r[k] === v)),
      aggregate: async (q: { where?: Row }) => {
        const xs = rows().filter(r => !q.where || Object.entries(q.where).every(([k, v]) => r[k] === v)).map(r => r.sortOrder as number)
        return { _max: { sortOrder: xs.length ? Math.max(...xs) : null } }
      },
      create: async ({ data }: { data: Row }) => { rows().push({ ...data }); return data },
      update: async ({ where, data }: { where: Row; data: Row }) => { const r = rows().find(x => x.id === where.id)!; Object.assign(r, data); return r },
    }
  }
  const fakePrisma = { testUnit: table('testUnit'), engineer: table('engineer'), user: table('user'), $transaction: async (cb: (tx: unknown) => Promise<void>) => cb(fakePrisma) }
  return { state, fakePrisma }
})
vi.mock('../lib/db.js', () => ({ prisma: fakePrisma }))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn(async () => {}) }))

import { syncVsmsOrg } from '../lib/orgSync/apply.js'
import { orgSyncState } from '../lib/orgSync/state.js'
import { fixtureSnapshot } from '../lib/orgSync/fixture.js'

beforeEach(() => { state.testUnit = []; state.engineer = []; state.user = []; orgSyncState.lastAppliedVersion = 0 })

describe('syncVsmsOrg', () => {
  it('空庫套 fixture：建 4 單位、26 名冊列、25 帳號；再套一次零變更（冪等）', async () => {
    const first = await syncVsmsOrg(fixtureSnapshot(1), { dryRun: false })
    expect(first.applied).toEqual({ units: { created: 4, updated: 0 }, engineers: { created: 26, updated: 0 }, users: { created: 25, updated: 0 } })
    expect(state.engineer.filter(e => e.value === 'Ericct_Hsieh')).toHaveLength(2)
    expect(state.user.find(u => u.username === 'Ericct_Hsieh')).toMatchObject({ role: 'admin', passwordHash: '!', allowedUnits: ['SIT-HW', 'SIT-SW'] })
    const second = await syncVsmsOrg(fixtureSnapshot(2), { dryRun: false })
    expect(second.applied).toEqual({ units: { created: 0, updated: 0 }, engineers: { created: 0, updated: 0 }, users: { created: 0, updated: 0 } })
    expect(orgSyncState.lastAppliedVersion).toBe(2)
  })
  it('dryRun 不寫入', async () => {
    const r = await syncVsmsOrg(fixtureSnapshot(1), { dryRun: true })
    expect(r.dryRun).toBe(true)
    expect(r.plan.units.create).toHaveLength(4)
    expect(state.testUnit).toEqual([])
    expect(orgSyncState.lastAppliedVersion).toBe(0)
  })
  it('同時兩個請求：序列化執行，不會各自讀到空庫而重複建立', async () => {
    // 未序列化時兩次呼叫都在對方寫入前讀到空庫，26 列名冊會被建成 52 列。
    const [a, b] = await Promise.all([
      syncVsmsOrg(fixtureSnapshot(1), { dryRun: false }),
      syncVsmsOrg(fixtureSnapshot(1), { dryRun: false }),
    ])
    expect(state.engineer).toHaveLength(26)
    expect(state.testUnit).toHaveLength(4)
    expect(state.user).toHaveLength(25)
    expect(b.applied).toEqual({ units: { created: 0, updated: 0 }, engineers: { created: 0, updated: 0 }, users: { created: 0, updated: 0 } })
    expect(a.applied?.engineers.created).toBe(26)
  })

  it('舊版本忽略', async () => {
    await syncVsmsOrg(fixtureSnapshot(5), { dryRun: false })
    const r = await syncVsmsOrg(fixtureSnapshot(4), { dryRun: false })
    expect(r.ignored).toBe(true)
    expect(orgSyncState.lastAppliedVersion).toBe(5)
  })
})
