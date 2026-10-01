// server/src/__tests__/changeHistoryRetention.test.ts
// changeHistory.ts 頂層 import prisma；測試絕不能碰真的資料庫，先 mock 掉。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { deleteMany } = vi.hoisted(() => ({ deleteMany: vi.fn() }))

vi.mock('../lib/db.js', () => ({ prisma: { changeHistory: { deleteMany } } }))
vi.mock('../lib/vtmsClient.js', () => ({ getTestPlanProgressBatch: vi.fn() }))

import {
  changeHistoryRetentionDays, changeHistoryRetentionCutoff, purgeOldChangeHistory,
  DEFAULT_CHANGE_HISTORY_RETENTION_DAYS,
} from '../lib/changeHistory.js'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHANGE_HISTORY_RETENTION_DAYS
  delete process.env.CHANGE_HISTORY_ENABLED
  deleteMany.mockResolvedValue({ count: 0 })
})

describe('changeHistoryRetentionDays 保留天數', () => {
  it('預設一年（365 天）', () => {
    expect(DEFAULT_CHANGE_HISTORY_RETENTION_DAYS).toBe(365)
    expect(changeHistoryRetentionDays()).toBe(365)
  })

  it('可用環境變數調整', () => {
    expect(changeHistoryRetentionDays('30')).toBe(30)
    process.env.CHANGE_HISTORY_RETENTION_DAYS = '730'
    expect(changeHistoryRetentionDays()).toBe(730)
  })

  it('非正整數一律退回預設，避免設錯把整張表清空', () => {
    for (const raw of ['', '0', '-5', 'abc', '1.5']) {
      expect(changeHistoryRetentionDays(raw)).toBe(365)
    }
  })
})

describe('changeHistoryRetentionCutoff 清除門檻', () => {
  it('往前推 N 天、時刻不變', () => {
    expect(changeHistoryRetentionCutoff(new Date('2026-10-01T03:00:00.000Z'), 365))
      .toEqual(new Date('2025-10-01T03:00:00.000Z'))
  })

  it('一年外刪、一年內留', () => {
    const cutoff = changeHistoryRetentionCutoff(new Date('2026-10-01T00:00:00.000Z'), 365)
    expect(new Date('2025-09-30T23:59:59.999Z') < cutoff).toBe(true)
    expect(new Date('2025-10-01T00:00:00.000Z') < cutoff).toBe(false)
    expect(new Date('2026-03-01T00:00:00.000Z') < cutoff).toBe(false)
  })

  it('不改動傳入的 Date', () => {
    const now = new Date('2026-10-01T00:00:00.000Z')
    changeHistoryRetentionCutoff(now, 365)
    expect(now).toEqual(new Date('2026-10-01T00:00:00.000Z'))
  })
})

describe('purgeOldChangeHistory', () => {
  it('刪除 at 早於門檻的列，天數取環境變數，回傳筆數', async () => {
    process.env.CHANGE_HISTORY_RETENTION_DAYS = '30'
    deleteMany.mockResolvedValue({ count: 7 })

    const n = await purgeOldChangeHistory(new Date('2026-10-01T00:00:00.000Z'))

    expect(n).toBe(7)
    expect(deleteMany).toHaveBeenCalledWith({ where: { at: { lt: new Date('2026-09-01T00:00:00.000Z') } } })
  })

  it('關閉寫入（CHANGE_HISTORY_ENABLED=false）時仍照保留期清除', async () => {
    process.env.CHANGE_HISTORY_ENABLED = 'false'
    await purgeOldChangeHistory(new Date('2026-10-01T00:00:00.000Z'))
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })
})
