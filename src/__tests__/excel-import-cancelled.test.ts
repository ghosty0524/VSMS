import { describe, it, expect } from 'vitest'
import { parseImportRows } from '../lib/excel'

const baseRow = {
  category: 'NPI', projectName: 'PDN-1', taskDescription: '內容', testUnit: 'SIT-HW',
  testEngineer: 'Eric', timeResource: 5, startDate: '2026/05/01', endDate: '2026/05/31',
  requiredPersonnel: 'A', testReport: '', isCompleted: 'FALSE', isDelayed: 'FALSE',
  delayReason: '', device: '', adminFlag: '', adminFlagNote: '', userFlag: '', userFlagNote: '',
}

describe('parseImportRows isCancelled', () => {
  it('parses TRUE into isCancelled', () => {
    const r = parseImportRows([{ ...baseRow, isCancelled: 'TRUE' }])
    expect(r.errors).toHaveLength(0)
    expect(r.valid[0].isCancelled).toBe(true)
  })
  it('defaults to false when column missing', () => {
    const r = parseImportRows([baseRow])
    expect(r.valid[0].isCancelled).toBe(false)
  })
  it('rejects isCancelled + isCompleted both TRUE', () => {
    const r = parseImportRows([{ ...baseRow, isCancelled: 'TRUE', isCompleted: 'TRUE' }])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].messages.join()).toContain('isCancelled')
  })
})
