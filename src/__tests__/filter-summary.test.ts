import { describe, it, expect } from 'vitest'
import {
  countNarrowingFilters, hiddenStatuses, statusChipText, isSameFilter,
  EMPTY_FILTER, DEFAULT_FILTER,
} from '../components/schedule/FilterSortBar'
import { summarizeSelection } from '../components/shared/MultiSelectDropdown'
import type { ScheduleStatus } from '../lib/status'

describe('countNarrowingFilters', () => {
  it('清除全部之後是 0 項', () => {
    expect(countNarrowingFilters(EMPTY_FILTER)).toBe(0)
  })

  // 這是本次改動的重點：舊版對登入預設值會算出 5（狀態的三個勾選值各一項、
  // 起訖日期各一項），使用者什麼都沒做就看到「5 項篩選」。
  it('登入預設值是 2 項（狀態與日期範圍各一），不是舊版的 5 項', () => {
    expect(countNarrowingFilters(DEFAULT_FILTER)).toBe(2)
  })

  it('同一個下拉勾幾個值都只算一項', () => {
    expect(countNarrowingFilters({ ...EMPTY_FILTER, categories: ['NPI'] })).toBe(1)
    expect(countNarrowingFilters({ ...EMPTY_FILTER, categories: ['NPI', 'AVL', 'Security'] })).toBe(1)
  })

  it('狀態勾滿全部等於沒有篩選', () => {
    const all: ScheduleStatus[] = ['Completed', 'Delayed', 'Testing', 'Planned', 'Cancelled']
    expect(countNarrowingFilters({ ...EMPTY_FILTER, statuses: all })).toBe(0)
  })

  it('起訖日期是同一個條件的兩端，合起來算一項', () => {
    expect(countNarrowingFilters({ ...EMPTY_FILTER, ganttStart: '2026/01/01' })).toBe(1)
    expect(countNarrowingFilters({ ...EMPTY_FILTER, ganttEnd: '2026/06/30' })).toBe(1)
    expect(countNarrowingFilters({ ...EMPTY_FILTER, ganttStart: '2026/01/01', ganttEnd: '2026/06/30' })).toBe(1)
  })

  // 舊版把 showAllUnits 為 true 算成一項篩選，但它是把結果變多而不是變少。
  it('showAllUnits 不列入計算', () => {
    expect(countNarrowingFilters({ ...EMPTY_FILTER, showAllUnits: true })).toBe(0)
  })

  it('只有空白的關鍵字不算一項', () => {
    expect(countNarrowingFilters({ ...EMPTY_FILTER, keyword: '   ' })).toBe(0)
    expect(countNarrowingFilters({ ...EMPTY_FILTER, keyword: 'PDN' })).toBe(1)
  })

  it('旗標篩選各算一項', () => {
    expect(countNarrowingFilters({ ...EMPTY_FILTER, showUserFlagged: true })).toBe(1)
    expect(countNarrowingFilters({ ...EMPTY_FILTER, showUserFlagged: true, showAdminFlagged: true })).toBe(2)
  })
})

describe('hiddenStatuses', () => {
  it('沒設狀態篩選時沒有東西被擋掉', () => {
    expect(hiddenStatuses(EMPTY_FILTER)).toEqual([])
  })

  it('登入預設會擋掉 Completed 與 Cancelled', () => {
    expect(hiddenStatuses(DEFAULT_FILTER)).toEqual(['Completed', 'Cancelled'])
  })

  it('勾滿全部時沒有東西被擋掉', () => {
    const all: ScheduleStatus[] = ['Completed', 'Delayed', 'Testing', 'Planned', 'Cancelled']
    expect(hiddenStatuses({ ...EMPTY_FILTER, statuses: all })).toEqual([])
  })
})

describe('isSameFilter', () => {
  it('同一個物件（或內容相同的兩個物件）視為相同', () => {
    expect(isSameFilter(EMPTY_FILTER, EMPTY_FILTER)).toBe(true)
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER })).toBe(true)
  })

  it('EMPTY_FILTER 與 DEFAULT_FILTER 不同（狀態與甘特圖範圍不同）', () => {
    expect(isSameFilter(EMPTY_FILTER, DEFAULT_FILTER)).toBe(false)
  })

  it('陣列欄位內容相同但參考不同仍視為相同；內容不同則不同', () => {
    const a = { ...EMPTY_FILTER, categories: ['NPI', 'AVL'] }
    const b = { ...EMPTY_FILTER, categories: ['NPI', 'AVL'] }
    expect(isSameFilter(a, b)).toBe(true)
    expect(isSameFilter(a, { ...EMPTY_FILTER, categories: ['NPI'] })).toBe(false)
    // 順序不同也算不同（陣列逐項比對，不排序）
    expect(isSameFilter(a, { ...EMPTY_FILTER, categories: ['AVL', 'NPI'] })).toBe(false)
  })

  it('sortRules 內容相同（含 dir）視為相同，欄位或方向不同則不同', () => {
    const a = { ...EMPTY_FILTER, sortRules: [{ field: 'startDate' as const, dir: 'asc' as const }] }
    const b = { ...EMPTY_FILTER, sortRules: [{ field: 'startDate' as const, dir: 'asc' as const }] }
    expect(isSameFilter(a, b)).toBe(true)
    expect(isSameFilter(a, { ...EMPTY_FILTER, sortRules: [{ field: 'startDate' as const, dir: 'desc' as const }] })).toBe(false)
    expect(isSameFilter(a, { ...EMPTY_FILTER, sortRules: [] })).toBe(false)
  })

  it('只有 showAllUnits 不同就視為不同（清除篩選要保留它，靠的就是這個判斷）', () => {
    expect(isSameFilter({ ...EMPTY_FILTER, showAllUnits: true }, EMPTY_FILTER)).toBe(false)
    expect(isSameFilter({ ...EMPTY_FILTER, showAllUnits: true }, { ...EMPTY_FILTER, showAllUnits: true })).toBe(true)
  })

  it('每個純量欄位（keyword／ganttStart／ganttEnd／旗標）不同都會被判定不同', () => {
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, keyword: 'PDN' })).toBe(false)
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, ganttStart: '2026/01/01' })).toBe(false)
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, ganttEnd: '2026/12/31' })).toBe(false)
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, showUserFlagged: true })).toBe(false)
    expect(isSameFilter(EMPTY_FILTER, { ...EMPTY_FILTER, showAdminFlagged: true })).toBe(false)
  })
})

describe('summarizeSelection', () => {
  it('未選時顯示「全部」', () => {
    expect(summarizeSelection([])).toBe('全部')
  })

  it('兩項以內全部列出', () => {
    expect(summarizeSelection(['NPI'])).toBe('NPI')
    expect(summarizeSelection(['NPI', 'AVL'])).toBe('NPI、AVL')
  })

  it('超過兩項時列前兩項再加計數', () => {
    expect(summarizeSelection(['NPI', 'AVL', 'Security'])).toBe('NPI、AVL +1')
    expect(summarizeSelection(['NPI', 'AVL', 'Security', 'Regression'])).toBe('NPI、AVL +2')
  })

  it('顯示文字沿用 optionLabels（例如已停用的註記）', () => {
    expect(summarizeSelection(['Eric'], { Eric: 'Eric（已停用）' })).toBe('Eric（已停用）')
  })

  it('沒有對照的值直接用原值', () => {
    expect(summarizeSelection(['Eric', 'Kirin'], { Eric: 'Eric（已停用）' })).toBe('Eric（已停用）、Kirin')
  })
})

describe('statusChipText', () => {
  it('預設篩選顯示中文的已隱藏狀態', () => {
    expect(statusChipText(DEFAULT_FILTER)).toBe('已完成、已取消')
  })
  it('隱藏超過兩個時改列出已選的狀態，也是中文', () => {
    const text = statusChipText({ ...DEFAULT_FILTER, statuses: ['Delayed'] as ScheduleStatus[] })
    expect(text).toContain('延遲')
    expect(text).not.toContain('Delayed')
  })
})
