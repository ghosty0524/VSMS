// server/src/__tests__/changeHistoryRecord.test.ts
// prisma 與 VTMS 全部 mock：DATABASE_URL 指到唯一一份正式 vsms 資料庫，測試絕不能碰。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createMany, planBatch } = vi.hoisted(() => ({
  createMany: vi.fn(),
  planBatch: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({ prisma: { changeHistory: { createMany } } }))
vi.mock('../lib/vtmsClient.js', () => ({ getTestPlanProgressBatch: planBatch }))

import {
  recordChange, recordChanges, resolvePlanNames, isChangeHistoryEnabled, PLAN_NAME_TIMEOUT_MS,
  type RecordChangeInput,
} from '../lib/changeHistory.js'
import { scheduleRow } from './helpers/scheduleRow.js'

const written = () => createMany.mock.calls.flatMap(c => c[0].data)

const createInput = (): RecordChangeInput => ({
  action: 'create', actor: 'Will_Wang', actorSource: 'user', before: null, after: scheduleRow(),
})

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHANGE_HISTORY_ENABLED
  createMany.mockResolvedValue({ count: 1 })
  planBatch.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.CHANGE_HISTORY_ENABLED
})

describe('recordChange', () => {
  it('create：寫入一列，含 PDN、標籤、關鍵欄位初始值', async () => {
    await recordChange(createInput())

    expect(createMany).toHaveBeenCalledTimes(1)
    const [entry] = written()
    expect(entry).toMatchObject({
      pdn: 'PDN-250048',
      projectLabel: 'PDN-250048 ECA-6710C',
      entityType: 'schedule',
      entityId: 's1',
      entityLabel: 'PDN-250048 ECA-6710C / NPI / Lily_Lee',
      planId: null,
      action: 'create',
      actor: 'Will_Wang',
      actorSource: 'user',
    })
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(entry.at).toBeInstanceOf(Date)
    expect(entry.changes).toHaveLength(8)
    // 整筆寫入物件都不含手填文字（任務說明、需求人員）
    const json = JSON.stringify(entry)
    expect(json).not.toContain('EMC 預測試')
    expect(json).not.toContain('Amy_Chen')
  })

  it('update 沒有任何變動就不寫入', async () => {
    await recordChange({ action: 'update', actor: 'Will_Wang', actorSource: 'user', before: scheduleRow(), after: scheduleRow() })
    expect(createMany).not.toHaveBeenCalled()
  })

  it('update 只動到旗標欄位時記為 flag', async () => {
    await recordChange({
      action: 'update', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow(), after: scheduleRow({ userFlag: true, userFlagNote: '請看' }),
    })
    expect(written()[0].action).toBe('flag')
  })

  it('update 動到旗標以外的欄位時維持 update', async () => {
    await recordChange({
      action: 'update', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow(), after: scheduleRow({ userFlag: true, endDate: '2026/10/09' }),
    })
    expect(written()[0].action).toBe('update')
  })

  it('delete：changes 為空陣列，PDN 與標籤取刪除當下的資料', async () => {
    await recordChange({
      action: 'delete', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow({ vtmsPlanId: 'plan-1' }), after: null,
    })
    expect(written()[0]).toMatchObject({
      action: 'delete', pdn: 'PDN-250048', entityId: 's1',
      entityLabel: 'PDN-250048 ECA-6710C / NPI / Lily_Lee',
      planId: 'plan-1', changes: [],
    })
    expect(JSON.stringify(written()[0])).not.toContain('EMC 預測試')
  })

  it('link：關聯計畫存 VTMS 計畫名稱', async () => {
    planBatch.mockResolvedValue({ 'plan-1': { planId: 'plan-1', planName: 'EMC 預測試計畫' } })
    await recordChange({
      action: 'link', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow(), after: scheduleRow({ vtmsPlanId: 'plan-1' }),
    })
    expect(planBatch).toHaveBeenCalledWith(['plan-1'])
    expect(written()[0]).toMatchObject({
      action: 'link', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: null, after: 'EMC 預測試計畫' }],
    })
  })

  it('unlink：planId 記被解除的計畫', async () => {
    planBatch.mockResolvedValue({ 'plan-1': { planId: 'plan-1', planName: 'EMC 預測試計畫' } })
    await recordChange({
      action: 'unlink', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow({ vtmsPlanId: 'plan-1' }), after: scheduleRow(),
    })
    expect(written()[0]).toMatchObject({
      action: 'unlink', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: 'EMC 預測試計畫', after: null }],
    })
  })

  it('VTMS 打不到時計畫欄位退回存 id', async () => {
    planBatch.mockRejectedValue(new Error('VTMS request timed out'))
    await recordChange({
      action: 'link', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow(), after: scheduleRow({ vtmsPlanId: 'plan-1' }),
    })
    expect(written()[0].changes).toEqual([
      { field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: null, after: 'plan-1' },
    ])
  })

  it('VTMS 沒回應時 3 秒後放棄查名稱', async () => {
    vi.useFakeTimers()
    planBatch.mockReturnValue(new Promise(() => {}))
    const pending = resolvePlanNames(['plan-1'])
    await vi.advanceTimersByTimeAsync(PLAN_NAME_TIMEOUT_MS)
    await expect(pending).resolves.toEqual({})
  })

  it('計畫沒變時不查 VTMS', async () => {
    await recordChange({
      action: 'update', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow({ vtmsPlanId: 'plan-1' }),
      after: scheduleRow({ vtmsPlanId: 'plan-1', testEngineer: 'Will_Wang' }),
    })
    expect(planBatch).not.toHaveBeenCalled()
    expect(written()[0].planId).toBe('plan-1')
  })

  it('手填欄位：整筆寫入物件（changes、entityLabel、projectLabel…）都不含原文', async () => {
    const secrets = (tag: string) => ({
      taskDescription: `任務說明-機密${tag}`,
      requiredPersonnel: `需求人員-機密${tag}`,
      delayReason: `延遲原因-機密${tag}`,
      testReport: `報告-機密${tag}`,
      adminFlagNote: `主管備註-機密${tag}`,
      userFlagNote: `使用者備註-機密${tag}`,
    })
    await recordChange({
      action: 'update', actor: 'Will_Wang', actorSource: 'user',
      before: scheduleRow(secrets('A')),
      after: scheduleRow(secrets('B')),
    })
    const [entry] = written()
    expect(entry.changes).toEqual([
      { field: 'taskDescription', label: '任務說明', changed: true },
      { field: 'requiredPersonnel', label: '需求人員', changed: true },
      { field: 'delayReason', label: '延遲原因', changed: true },
      { field: 'testReport', label: '測試報告', changed: true },
      { field: 'adminFlagNote', label: '主管旗標備註', changed: true },
      { field: 'userFlagNote', label: '使用者旗標備註', changed: true },
    ])
    expect(entry.entityLabel).toBe('PDN-250048 ECA-6710C / NPI / Lily_Lee')
    expect(JSON.stringify(entry)).not.toMatch(/機密/)
  })

  it('寫入失敗不往外丟，只留 change_history_error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    createMany.mockRejectedValue(new Error("Table 'vsms.change_history' doesn't exist"))

    await expect(recordChange(createInput())).resolves.toBeUndefined()

    expect(err).toHaveBeenCalledWith('change_history_error', expect.objectContaining({
      error: expect.stringContaining('change_history'),
    }))
    err.mockRestore()
  })

  it('CHANGE_HISTORY_ENABLED=false 時完全不寫入（不分大小寫）', async () => {
    process.env.CHANGE_HISTORY_ENABLED = 'false'
    expect(isChangeHistoryEnabled()).toBe(false)
    await recordChange(createInput())
    expect(createMany).not.toHaveBeenCalled()

    process.env.CHANGE_HISTORY_ENABLED = 'FALSE'
    expect(isChangeHistoryEnabled()).toBe(false)
    process.env.CHANGE_HISTORY_ENABLED = 'true'
    expect(isChangeHistoryEnabled()).toBe(true)
  })
})

describe('recordChanges', () => {
  it('多筆一次 createMany', async () => {
    await recordChanges([
      { ...createInput(), action: 'import' },
      { ...createInput(), action: 'import', after: scheduleRow({ id: 's2', projectName: 'PDN-250049 ECA-6711' }) },
    ])
    expect(createMany).toHaveBeenCalledTimes(1)
    expect(written().map(e => [e.entityId, e.pdn, e.action])).toEqual([
      ['s1', 'PDN-250048', 'import'],
      ['s2', 'PDN-250049', 'import'],
    ])
  })

  it('actor 空白時記為 unknown，過長截到 100 字', async () => {
    await recordChanges([
      { ...createInput(), actor: '   ' },
      { ...createInput(), actor: 'x'.repeat(150) },
    ])
    expect(written().map(e => e.actor)).toEqual(['unknown', 'x'.repeat(100)])
  })
})
