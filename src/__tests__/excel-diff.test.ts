import { describe, it, expect } from 'vitest'
import type { Schedule } from '../types'

interface FieldDiff {
  field: 'testReport' | 'isCompleted' | 'isDelayed' | 'delayReason'
  label: string
  oldVal: string
  newVal: string
}
interface RecordDiff {
  projectName: string
  taskDescription: string
  diffs: FieldDiff[]
}

type IncomingRow = {
  projectName: string
  taskDescription: string
  testEngineer: string
  startDate: string
  endDate: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  delayReason: string
  [key: string]: unknown
}

function computeDiffs(incoming: IncomingRow[], existing: Schedule[]): RecordDiff[] {
  const boolStr = (v: boolean) => (v ? '是' : '否')
  const result: RecordDiff[] = []
  for (const row of incoming) {
    const match = existing.find(s =>
      s.projectName === row.projectName &&
      s.taskDescription === row.taskDescription &&
      s.testEngineer === row.testEngineer &&
      s.startDate === row.startDate &&
      s.endDate === row.endDate
    )
    if (!match) continue
    const diffs: FieldDiff[] = []
    if (row.testReport !== match.testReport)
      diffs.push({ field: 'testReport', label: '測試報告', oldVal: match.testReport || '（空白）', newVal: row.testReport || '（空白）' })
    if (row.isCompleted !== match.isCompleted)
      diffs.push({ field: 'isCompleted', label: 'Completed', oldVal: boolStr(match.isCompleted), newVal: boolStr(row.isCompleted) })
    if (row.isDelayed !== match.isDelayed)
      diffs.push({ field: 'isDelayed', label: 'Delayed', oldVal: boolStr(match.isDelayed), newVal: boolStr(row.isDelayed) })
    if (row.delayReason !== match.delayReason)
      diffs.push({ field: 'delayReason', label: '延遲原因', oldVal: match.delayReason || '（空白）', newVal: row.delayReason || '（空白）' })
    if (diffs.length > 0)
      result.push({ projectName: match.projectName, taskDescription: row.taskDescription, diffs })
  }
  return result
}

const baseExisting: Schedule = {
  id: '1', category: 'NPI', projectName: 'Alpha 專案',
  taskDescription: '整合測試', testUnit: 'SIT-HW', testEngineer: 'Alice',
  timeResource: 5, startDate: '2026/05/01', endDate: '2026/05/31',
  requiredPersonnel: '人員A', testReport: '', isCompleted: false,
  isDelayed: false, delayReason: '', createdBy: 'admin', updatedBy: 'admin',
  createdAt: '', updatedAt: '',
}

const row = (overrides: Partial<IncomingRow> = {}): IncomingRow => ({
  projectName: 'Alpha 專案', taskDescription: '整合測試',
  testEngineer: 'Alice', startDate: '2026/05/01', endDate: '2026/05/31',
  testReport: '', isCompleted: false, isDelayed: false, delayReason: '',
  ...overrides,
})

describe('computeDiffs', () => {
  it('無配對記錄（taskDescription 不符）→ 回傳空陣列', () => {
    expect(computeDiffs([row({ taskDescription: '不存在的工作' })], [baseExisting])).toHaveLength(0)
  })

  it('無配對記錄（projectName 不符）→ 回傳空陣列', () => {
    expect(computeDiffs([row({ projectName: '其他專案' })], [baseExisting])).toHaveLength(0)
  })

  it('無配對記錄（testEngineer 不符）→ 回傳空陣列', () => {
    expect(computeDiffs([row({ testEngineer: 'Bob' })], [baseExisting])).toHaveLength(0)
  })

  it('無配對記錄（startDate 不符）→ 回傳空陣列', () => {
    expect(computeDiffs([row({ startDate: '2026/06/01' })], [baseExisting])).toHaveLength(0)
  })

  it('無配對記錄（endDate 不符）→ 回傳空陣列', () => {
    expect(computeDiffs([row({ endDate: '2026/06/30' })], [baseExisting])).toHaveLength(0)
  })

  it('配對但無差異 → 回傳空陣列', () => {
    expect(computeDiffs([row()], [baseExisting])).toHaveLength(0)
  })

  it('testReport 有差異', () => {
    const result = computeDiffs([row({ testReport: 'http://report' })], [baseExisting])
    expect(result).toHaveLength(1)
    expect(result[0].diffs[0].field).toBe('testReport')
    expect(result[0].diffs[0].oldVal).toBe('（空白）')
    expect(result[0].diffs[0].newVal).toBe('http://report')
  })

  it('isCompleted 有差異', () => {
    const result = computeDiffs([row({ isCompleted: true })], [baseExisting])
    expect(result[0].diffs[0].field).toBe('isCompleted')
    expect(result[0].diffs[0].oldVal).toBe('否')
    expect(result[0].diffs[0].newVal).toBe('是')
  })

  it('多個欄位同時有差異', () => {
    const result = computeDiffs(
      [row({ testReport: 'http://x', isCompleted: true, isDelayed: true, delayReason: '設備問題' })],
      [baseExisting]
    )
    expect(result[0].diffs).toHaveLength(4)
  })

  it('全新記錄（無配對）不納入差異', () => {
    const result = computeDiffs(
      [
        row({ testReport: 'http://x', isCompleted: true }),
        row({ projectName: '全新專案', taskDescription: '全新工作', testReport: '新報告' }),
      ],
      [baseExisting]
    )
    expect(result).toHaveLength(1)
    expect(result[0].taskDescription).toBe('整合測試')
  })

  it('projectName 從現有記錄取得', () => {
    const result = computeDiffs([row({ testReport: 'x' })], [baseExisting])
    expect(result[0].projectName).toBe('Alpha 專案')
  })

  it('相同 taskDescription+projectName 但不同 testEngineer → 不誤配', () => {
    const otherEngineer: Schedule = {
      ...baseExisting, id: '2', testEngineer: 'Bob', testReport: 'TD999',
    }
    const result = computeDiffs(
      [row({ testReport: 'x' })],
      [baseExisting, otherEngineer]
    )
    expect(result).toHaveLength(1)
    expect(result[0].diffs[0].newVal).toBe('x')
  })

  it('相同 taskDescription+projectName+testEngineer 但不同 startDate → 不誤配', () => {
    const otherDate: Schedule = {
      ...baseExisting, id: '2', startDate: '2026/06/01', endDate: '2026/06/30', testReport: 'TD999',
    }
    const result = computeDiffs(
      [row({ testReport: 'x' })],
      [baseExisting, otherDate]
    )
    expect(result).toHaveLength(1)
    expect(result[0].projectName).toBe('Alpha 專案')
  })
})
