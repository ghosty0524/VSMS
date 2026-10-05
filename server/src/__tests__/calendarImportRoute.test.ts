// server/src/__tests__/calendarImportRoute.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import ExcelJS from 'exceljs'

const { restFindUnique, restUpsert, auditSpy } = vi.hoisted(() => ({
  restFindUnique: vi.fn(),
  restUpsert: vi.fn(),
  auditSpy: vi.fn(),
}))

// 刻意不提供 calendarConfig：route 若還去寫舊表，會在這裡直接 TypeError
vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique: restFindUnique, upsert: restUpsert } }
  return {
    prisma: {
      ...tx,
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      user: { findUnique: async () => ({ username: 'boss', displayName: 'Boss' }) },
    },
  }
})
vi.mock('../lib/storage.js', () => ({ appendAudit: auditSpy }))

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

function app(role: string | null = 'super_admin') {
  const a = express()
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (role) req.session = { sessionId: 's1', username: 'boss', role } as unknown as Request['session']
    else req.session = {} as unknown as Request['session']
    next()
  })
  a.use('/api/calendar', calendarRouter)
  return a
}

beforeEach(() => {
  restFindUnique.mockReset()
  restUpsert.mockReset()
  auditSpy.mockReset()
  restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: [] })
})

describe('POST /api/calendar/import-government', () => {
  it('正常的日曆併進休息日清單，回傳完整清單', async () => {
    const file = await buildCalendar(2026, [
      { month: 2, extraFilled: [16, 17, 18, 19, 20, 27] }, // 春節連假，單月 6 個平日
      { month: 10, extraFilled: [9, 26] },
    ])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    const expected = [
      '2026/02/16', '2026/02/17', '2026/02/18', '2026/02/19', '2026/02/20', '2026/02/27',
      '2026/10/09', '2026/10/26',
    ]
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, year: 2026, detected: 8, added: 8, skipped: 0, specificDates: expected })
    expect(restUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, weekends: true, specificDates: expected },
      update: { weekends: true, specificDates: expected },
    })
    // multer 把檔名當 latin1 解；稽核要存轉回 UTF-8 的中文檔名
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays',
      ['匯入 115年辦公日曆表.xlsx', '2026 年', '新增 8 筆'])
  })

  // 只新增不刪除：公司自訂休假與其他年度的日期都要留著
  it('既有的日期保留，重複的略過', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2025/12/25', '2026/10/09', '2026/11/20'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.body).toMatchObject({ ok: true, detected: 2, added: 1, skipped: 1 })
    expect(res.body.specificDates).toEqual(['2025/12/25', '2026/10/09', '2026/10/26', '2026/11/20'])
  })

  // 規格：讀清單一律走共用的正規化。既有的 '2026-10-09'（短橫線）要和匯入的 '2026/10/09' 視為同一天
  it('既有清單是短橫線格式時，先正規化再去重', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026-10-09'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, detected: 2, added: 1, skipped: 1 })
    expect(res.body.specificDates).toEqual(['2026/10/09', '2026/10/26'])
    expect(restUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { weekends: true, specificDates: ['2026/10/09', '2026/10/26'] },
    }))
  })

  it('既有清單存成 JSON 字串時照樣解析，不會被拆成單一字元', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: '["2026/11/20"]' })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, added: 2, skipped: 0 })
    expect(res.body.specificDates).toEqual(['2026/10/09', '2026/10/26', '2026/11/20'])
  })

  it('既有清單有不合法的日期時拒絕匯入（422），不默默丟掉、不寫入', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2025/12/25', '2026/02/30'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(422)
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('2026/02/30')
    expect(res.body.message).toContain('特定休息日')
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('id=1 那列不存在時匯入失敗（500），不當成空清單', async () => {
    restFindUnique.mockResolvedValue(null)
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('既有清單是無法解析的 JSON 字串時匯入失敗（500），不寫入', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: '{oops' })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(restUpsert).not.toHaveBeenCalled()
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
    expect(restUpsert).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('未登入 401，不寫入', async () => {
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])
    const res = await request(app(null))
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(401)
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('部級主管（admin）403：匯入只限系統管理員', async () => {
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])
    const res = await request(app('admin'))
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(403)
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('沒有新增任何日期也記一筆匯入稽核', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    await request(app()).post('/api/calendar/import-government').attach('file', file, 'a.xlsx')

    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['匯入 a.xlsx', '2026 年', '新增 0 筆'])
  })

  it('舊的 GET /non-weekend-holidays 已移除', async () => {
    const res = await request(app()).get('/api/calendar/non-weekend-holidays?year=2026')
    expect(res.status).toBe(404)
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
