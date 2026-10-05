// server/src/__tests__/calendarImportRoute.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import ExcelJS from 'exceljs'

const { calendarUpsert } = vi.hoisted(() => ({ calendarUpsert: vi.fn() }))

vi.mock('../lib/db.js', () => ({
  prisma: { calendarConfig: { upsert: calendarUpsert } },
}))

import calendarRouter, { findAbnormalMonths, MAX_WEEKDAY_HOLIDAYS_PER_MONTH } from '../routes/calendar.js'

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
const HOLIDAY = 'FFFF0000'

/**
 * 做一份和政府「辦公日曆表」同版面的 Excel：每個月一個區塊，月份中文數字隔兩欄接「月」，
 * 下一列是「日 一 二 … 六」表頭，日期格每兩列一週。週末與 extraFilled 的日子塗假日色。
 */
async function buildCalendar(year: number, months: { month: number; extraFilled: number[] }[]) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('cal')
  ws.getCell(2, 2).value = `${year - 1911}年（${year}）辦公日曆表`

  months.forEach(({ month, extraFilled }, i) => {
    const top = 4 + i * 16
    const startCol = 3
    ws.getCell(top, startCol + 2).value = CN[month]
    ws.getCell(top, startCol + 4).value = '月'
    '日一二三四五六'.split('').forEach((d, k) => { ws.getCell(top + 1, startCol + k).value = d })

    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
    for (let day = 1; day <= days; day++) {
      const slot = first + day - 1
      const cell = ws.getCell(top + 2 + Math.floor(slot / 7) * 2, startCol + (slot % 7))
      cell.value = day
      const dow = slot % 7
      if (dow === 0 || dow === 6 || extraFilled.includes(day)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY } }
      }
    }
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function app() {
  const a = express()
  a.use('/api/calendar', calendarRouter)
  return a
}

beforeEach(() => { calendarUpsert.mockReset() })

describe('POST /api/calendar/import-government', () => {
  it('正常的日曆照常匯入', async () => {
    const file = await buildCalendar(2026, [
      { month: 2, extraFilled: [16, 17, 18, 19, 20, 27] }, // 春節連假，單月 6 個平日
      { month: 10, extraFilled: [9, 26] },
    ])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(calendarUpsert).toHaveBeenCalledTimes(1)
    expect(calendarUpsert.mock.calls[0][0].update.nonWeekendHolidays).toEqual([
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-27',
      '2026-10-09', '2026-10-26',
    ])
  })

  // 2026-04-27 實際發生過：10 月的平日格被判成假日色，整月週一到週四都成了假日，
  // VTMS 通知因此停跑、日誌提醒追問錯的日期。這種結果寧可擋下，也不能寫進去。
  it('某個月平日假日多得不合理時整份拒絕，現有設定不動', async () => {
    const monToThu = [1, 5, 6, 7, 8, 12, 13, 14, 15, 19, 20, 21, 22, 26, 27, 28, 29]
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [...monToThu, 9] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(422)
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('2026-10')
    expect(res.body.message).toContain('18')
    expect(calendarUpsert).not.toHaveBeenCalled()
  })
})

describe('findAbnormalMonths', () => {
  const days = (month: string, n: number) =>
    Array.from({ length: n }, (_, i) => `2026-${month}-${String(i + 1).padStart(2, '0')}`)

  it(`單月 ${MAX_WEEKDAY_HOLIDAYS_PER_MONTH} 天以內不算異常`, () => {
    expect(findAbnormalMonths(days('02', MAX_WEEKDAY_HOLIDAYS_PER_MONTH))).toEqual([])
  })

  it('超過上限的月份逐一列出', () => {
    const list = [...days('02', 3), ...days('10', MAX_WEEKDAY_HOLIDAYS_PER_MONTH + 1)]
    expect(findAbnormalMonths(list)).toEqual([
      { month: '2026-10', count: MAX_WEEKDAY_HOLIDAYS_PER_MONTH + 1 },
    ])
  })
})
