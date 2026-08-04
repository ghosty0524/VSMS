import { describe, it, expect } from 'vitest'
import { clampRange } from '../components/schedule/ScheduleListView'

describe('clampRange', () => {
  it('範圍完全落在縮短後的列表之外時，收縮到列表尾端', () => {
    // 使用者原本捲動到第 500 列附近，篩選後只剩 10 列
    expect(clampRange({ start: 500, end: 560 }, 10)).toEqual({ start: 10, end: 10 })
  })

  it('範圍部分超出列表尾端時，只裁掉超出的部分', () => {
    expect(clampRange({ start: 5, end: 60 }, 10)).toEqual({ start: 5, end: 10 })
  })

  it('範圍完全落在列表內時維持不變', () => {
    expect(clampRange({ start: 2, end: 8 }, 20)).toEqual({ start: 2, end: 8 })
  })

  it('列表為空時回傳空範圍', () => {
    expect(clampRange({ start: 5, end: 10 }, 0)).toEqual({ start: 0, end: 0 })
  })
})
