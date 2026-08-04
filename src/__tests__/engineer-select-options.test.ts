// src/__tests__/engineer-select-options.test.ts
// 需求四：表單保底顯示孤兒值。即使人員被停用或刪除，編輯既有排程時仍要讓
// 使用者看到原始值，而非被下拉悄悄清空誘導改派。
import { describe, it, expect } from 'vitest'
import { buildEngineerSelectOptions } from '../components/schedule/ScheduleFormModal'

const active = [
  { value: 'Alice_Wu', label: 'Alice_Wu' },
  { value: 'Carl_Lee', label: 'Carl_Lee' },
]

describe('buildEngineerSelectOptions', () => {
  it('孤兒值出現於選項（附註已停用或已刪除）', () => {
    const result = buildEngineerSelectOptions(active, 'Ben_Ko', true)
    expect(result).toEqual([
      ...active,
      { value: 'Ben_Ko', label: 'Ben_Ko（已停用或已刪除）' },
    ])
  })

  it('值已在選項中時不重複插入', () => {
    const result = buildEngineerSelectOptions(active, 'Alice_Wu', true)
    expect(result).toEqual(active)
  })

  it('testEngineer 為空字串時不插入', () => {
    const result = buildEngineerSelectOptions(active, '', true)
    expect(result).toEqual(active)
  })

  it('新增模式（isEditingExisting=false）不插入，即使值不在選項中', () => {
    const result = buildEngineerSelectOptions(active, 'Ben_Ko', false)
    expect(result).toEqual(active)
  })
})
