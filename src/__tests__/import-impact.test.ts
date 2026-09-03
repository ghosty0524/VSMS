import { describe, it, expect } from 'vitest'
import { computeReplaceImpact, computeDiffs } from '../lib/importImpact'
import type { IncomingRow } from '../lib/importImpact'
import type { Schedule } from '../types'

function sched({ projectName, ...over }: Partial<Schedule> & { projectName: string }): Schedule {
  return {
    id: projectName + '-id',
    category: 'NPI',
    projectName,
    taskDescription: 'desc',
    testUnit: 'SI',
    testEngineer: 'Alancc_Yen',
    timeResource: 5,
    startDate: '2026/09/01',
    endDate: '2026/09/10',
    requiredPersonnel: '',
    testReport: '',
    isCompleted: false,
    isDelayed: false,
    isCancelled: false,
    completedAt: null,
    delayReason: '',
    createdBy: 'admin',
    updatedBy: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    adminFlag: false,
    adminFlagNote: '',
    userFlag: false,
    userFlagNote: '',
    device: '',
    ...over,
  }
}

function row({ projectName, ...over }: Partial<IncomingRow> & { projectName: string }): IncomingRow {
  return {
    projectName,
    taskDescription: 'desc',
    testEngineer: 'Alancc_Yen',
    startDate: '2026/09/01',
    endDate: '2026/09/10',
    testReport: '',
    isCompleted: false,
    isDelayed: false,
    isCancelled: false,
    delayReason: '',
    device: '',
    adminFlag: false,
    adminFlagNote: '',
    userFlag: false,
    userFlagNote: '',
    ...over,
  }
}

describe('computeReplaceImpact', () => {
  // 這是舊版最危險的情境：匯入檔跟現有資料一筆都對不上時，差異清單是空的，
  // 舊版因此完全不確認就 replaceAll，整批資料靜默消失。
  it('匯入檔與現有資料完全對不上時，如實算出全部會被刪除', () => {
    const existing = [sched({ projectName: 'A' }), sched({ projectName: 'B' }), sched({ projectName: 'C' })]
    const incoming = [row({ projectName: 'X' }), row({ projectName: 'Y' })]

    const impact = computeReplaceImpact(incoming, existing)

    expect(impact.deleted).toBe(3)
    expect(impact.added).toBe(2)
    expect(impact.updated).toBe(0)
    expect(impact.unchanged).toBe(0)
    expect(impact.deletedSamples).toEqual(['A', 'B', 'C'])
    // 這正是舊版會靜默執行的情況
    expect(computeDiffs(incoming, existing)).toHaveLength(0)
  })

  it('內容完全相同時不刪不增', () => {
    const existing = [sched({ projectName: 'A' }), sched({ projectName: 'B' })]
    const incoming = [row({ projectName: 'A' }), row({ projectName: 'B' })]

    const impact = computeReplaceImpact(incoming, existing)

    expect(impact).toMatchObject({ deleted: 0, added: 0, updated: 0, unchanged: 2 })
  })

  it('同一筆但欄位有變動算成更新', () => {
    const existing = [sched({ projectName: 'A', testReport: 'TD001' })]
    const incoming = [row({ projectName: 'A', testReport: 'TD002' })]

    const impact = computeReplaceImpact(incoming, existing)

    expect(impact).toMatchObject({ deleted: 0, added: 0, updated: 1, unchanged: 0 })
    expect(computeDiffs(incoming, existing)[0].diffs[0]).toMatchObject({
      label: '測試報告', oldVal: 'TD001', newVal: 'TD002',
    })
  })

  it('比對鍵五個欄位任一不同就算不同筆', () => {
    const existing = [sched({ projectName: 'A', startDate: '2026/09/01' })]
    const incoming = [row({ projectName: 'A', startDate: '2026/09/02' })]

    const impact = computeReplaceImpact(incoming, existing)

    expect(impact).toMatchObject({ deleted: 1, added: 1, updated: 0 })
  })

  // 後端的 replace-all 對有管轄單位的 admin 只刪自己單位的排程，
  // 影響評估必須跟著縮小，否則會嚇到人也會誤導。
  it('有管轄單位時只評估該範圍，其餘列為不受影響', () => {
    const existing = [
      sched({ projectName: 'RA-1', testUnit: 'RA' }),
      sched({ projectName: 'RA-2', testUnit: 'RA' }),
      sched({ projectName: 'SI-1', testUnit: 'SI' }),
      sched({ projectName: 'SI-2', testUnit: 'SI' }),
    ]
    const incoming = [row({ projectName: 'RA-1', testUnit: 'RA' } as Partial<IncomingRow> & { projectName: string })]

    const impact = computeReplaceImpact(incoming, existing, ['RA'])

    expect(impact.scopeTotal).toBe(2)
    expect(impact.outOfScope).toBe(2)
    expect(impact.deleted).toBe(1)          // RA-2
    expect(impact.deletedSamples).toEqual(['RA-2'])
    expect(impact.unchanged).toBe(1)        // RA-1
  })

  it('空的 allowedUnits 代表不設限，範圍是全部', () => {
    const existing = [sched({ projectName: 'A', testUnit: 'RA' }), sched({ projectName: 'B', testUnit: 'SI' })]

    const impact = computeReplaceImpact([], existing, [])

    expect(impact.scopeTotal).toBe(2)
    expect(impact.outOfScope).toBe(0)
    expect(impact.deleted).toBe(2)
  })

  it('刪除範例最多列 8 筆，總數仍然完整', () => {
    const existing = Array.from({ length: 20 }, (_, i) => sched({ projectName: `P${i}` }))

    const impact = computeReplaceImpact([], existing)

    expect(impact.deleted).toBe(20)
    expect(impact.deletedSamples).toHaveLength(8)
  })

  it('匯入空檔等於清空全部', () => {
    const existing = [sched({ projectName: 'A' })]
    expect(computeReplaceImpact([], existing).deleted).toBe(1)
  })
})
