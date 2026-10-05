import { describe, it, expect, vi, beforeEach } from 'vitest'

const { restFindUnique } = vi.hoisted(() => ({ restFindUnique: vi.fn() }))
vi.mock('../lib/db.js', () => ({ prisma: { restDaysConfig: { findUnique: restFindUnique } } }))

import {
  toIsoHoliday, normalizeHolidayDates, readHolidays, uncoveredYearNote, normalizeRestDatesForWrite,
} from '../lib/holidays.js'

beforeEach(() => { vi.clearAllMocks() })

describe('toIsoHoliday', () => {
  it('斜線與 ISO 都轉成 ISO', () => {
    expect(toIsoHoliday('2026/02/27')).toBe('2026-02-27')
    expect(toIsoHoliday('2026-02-27')).toBe('2026-02-27')
    expect(toIsoHoliday(' 2026/12/25 ')).toBe('2026-12-25')
  })
  it('格式不合或不存在的日期回 null', () => {
    expect(toIsoHoliday('2026/2/27')).toBeNull()
    expect(toIsoHoliday('2026/02/30')).toBeNull()
    expect(toIsoHoliday('明天')).toBeNull()
  })
})

describe('normalizeHolidayDates', () => {
  it('混用格式、去重、排序，並列出年度', () => {
    const list = normalizeHolidayDates(['2026/12/25', '2026-02-27', '2026/02/27', '2027/01/01'])
    expect(list.dates).toEqual(['2026-02-27', '2026-12-25', '2027-01-01'])
    expect([...list.years].sort()).toEqual([2026, 2027])
  })
  it('接受 MySQL 回的 JSON 字串', () => {
    expect(normalizeHolidayDates('["2026/10/09"]').dates).toEqual(['2026-10-09'])
  })
  it('格式不合的單筆略過並 warn，其餘照用', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = normalizeHolidayDates(['2026/10/09', 'oops', 42])
    expect(list.dates).toEqual(['2026-10-09'])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('空陣列是合法的：沒有任何年度', () => {
    expect(normalizeHolidayDates([])).toEqual({ dates: [], years: new Set() })
  })
  // 假日被靜默清空，國定假日就會被當工作日：JSON 壞掉或不是陣列一定要拋錯
  it('JSON 壞掉或不是陣列時拋錯', () => {
    expect(() => normalizeHolidayDates('["2026/10/09"')).toThrow(/specificDates/)
    expect(() => normalizeHolidayDates({ a: 1 })).toThrow(/specificDates/)
  })
})

describe('readHolidays', () => {
  it('讀 rest_days_config id=1 的 specificDates', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    const list = await readHolidays()
    expect(restFindUnique).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(list.dates).toEqual(['2026-10-09', '2026-10-26'])
  })
  it('整列不存在時拋錯，不退化成空清單', async () => {
    restFindUnique.mockResolvedValue(null)
    await expect(readHolidays()).rejects.toThrow(/rest_days_config/)
  })
})

describe('uncoveredYearNote', () => {
  it('文字與既有註記逐字相同', () => {
    expect(uncoveredYearNote(2027)).toBe('行事曆未涵蓋 2027 年，工作日僅排除週六日、未排除國定假日')
  })
})

describe('normalizeRestDatesForWrite', () => {
  it('兩種格式都收，一律存成斜線、排序、去重', () => {
    expect(normalizeRestDatesForWrite(['2026-10-10', '2026/02/27', '2026/10/10']))
      .toEqual({ ok: true, dates: ['2026/02/27', '2026/10/10'] })
  })
  it('任一筆不合法就整份拒絕並列出壞的值', () => {
    expect(normalizeRestDatesForWrite(['2026/02/27', '2026/02/30', 'x']))
      .toEqual({ ok: false, bad: ['2026/02/30', 'x'] })
  })
  it('不是陣列就拒絕', () => {
    expect(normalizeRestDatesForWrite(undefined)).toEqual({ ok: false, bad: ['undefined'] })
  })
})
