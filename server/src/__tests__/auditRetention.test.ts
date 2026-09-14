// server/src/__tests__/auditRetention.test.ts
// storage.ts 頂層 import prisma；測試絕不能碰真的資料庫，先 mock 掉。
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ prisma: {} }))

import { auditRetentionCutoff, AUDIT_RETENTION_MONTHS } from '../lib/storage.js'

describe('auditRetentionCutoff 審計紀錄保留門檻', () => {
  it('保留兩個月', () => {
    expect(AUDIT_RETENTION_MONTHS).toBe(2)
  })

  it('往前推兩個曆月、時刻不變：9/14 10:30 → 7/14 10:30', () => {
    const cutoff = auditRetentionCutoff(new Date(2026, 8, 14, 10, 30))
    expect(cutoff).toEqual(new Date(2026, 6, 14, 10, 30))
  })

  it('跨年：1/15 → 前一年 11/15', () => {
    expect(auditRetentionCutoff(new Date(2027, 0, 15))).toEqual(new Date(2026, 10, 15))
  })

  it('目標月沒有該日時退回目標月最後一天：4/30 → 2/28，不溢位成 3/2', () => {
    expect(auditRetentionCutoff(new Date(2026, 3, 30))).toEqual(new Date(2026, 1, 28))
  })

  it('不改動傳入的 Date', () => {
    const now = new Date(2026, 8, 14)
    auditRetentionCutoff(now)
    expect(now).toEqual(new Date(2026, 8, 14))
  })
})
