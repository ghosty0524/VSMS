// server/src/routes/calendar.ts
import { Router, Request, Response } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/db.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const CN_MONTH: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8,
  '九': 9, '十': 10, '十一': 11, '十二': 12,
}

function toIsoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getFillArgb(cell: ExcelJS.Cell): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fill = cell.fill as any
  if (!fill) return null
  const fg = fill.fgColor
  if (!fg) return null
  if (typeof fg.argb === 'string') return (fg.argb as string).toUpperCase()
  return null
}

/**
 * 單月非週末假日的合理上限。台灣最長的春節連假落在同一個月，也只有 6～7 個平日。
 *
 * 解析是靠「出現最多次的填色」判定假日，原檔的填色只要和預期不同就會整片誤判，
 * 而且不會報錯：2026-04-27 匯入的 115 年日曆把 10 月週一到週四全當成假日，
 * VTMS 的通知因此停跑、工作日誌提醒追問錯的日期，到 10 月才被發現。
 */
export const MAX_WEEKDAY_HOLIDAYS_PER_MONTH = 8

export function findAbnormalMonths(isoDates: string[]): { month: string; count: number }[] {
  const byMonth = new Map<string, number>()
  for (const d of isoDates) {
    const month = d.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1)
  }
  return [...byMonth.entries()]
    .filter(([, count]) => count > MAX_WEEKDAY_HOLIDAYS_PER_MONTH)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))
}

async function parseGovernmentCalendar(rawBuffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  const ab = rawBuffer.buffer.slice(
    rawBuffer.byteOffset,
    rawBuffer.byteOffset + rawBuffer.byteLength
  ) as ArrayBuffer
  await wb.xlsx.load(ab)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Excel 工作表不存在')

  const titleText = String(ws.getCell(2, 2).value ?? '')
  const yearMatch = titleText.match(/(19|20)\d{2}/)
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear()

  const monthBlocks: { month: number; headerRow: number; startCol: number }[] = []

  ws.eachRow((row, rowNumber) => {
    row.eachCell((_cell, colNumber) => {
      const v = ws.getCell(rowNumber, colNumber).value
      if (v == null) return
      const s = String(v).trim()
      const month = CN_MONTH[s]
      if (!month) return
      const next2 = String(ws.getCell(rowNumber, colNumber + 2).value ?? '').trim()
      if (next2 !== '月') return
      const startCol = colNumber - 2
      const headerRow = rowNumber + 1
      if (String(ws.getCell(headerRow, startCol).value ?? '').trim() !== '日') return
      monthBlocks.push({ month, headerRow, startCol })
    })
  })

  if (monthBlocks.length === 0)
    throw new Error('找不到月份區塊（格式可能不是政府辦公日曆表）')

  const colorCount = new Map<string, number>()

  for (const blk of monthBlocks) {
    const gridStart = blk.headerRow + 1
    for (let w = 0; w < 6; w++) {
      const dayRow = gridStart + w * 2
      for (let dow = 0; dow < 7; dow++) {
        const cell = ws.getCell(dayRow, blk.startCol + dow)
        const val = cell.value
        if (typeof val !== 'number' || !Number.isInteger(val)) continue
        if (val < 1 || val > 31) continue
        const argb = getFillArgb(cell)
        if (argb && argb !== '00000000') {
          colorCount.set(argb, (colorCount.get(argb) ?? 0) + 1)
        }
      }
    }
  }

  const sortedColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1])
  const holidayColor = sortedColors.length ? sortedColors[0][0] : null

  if (!holidayColor)
    throw new Error('偵測不到放假填色（此檔案可能未用顏色標示放假日）')

  const results = new Set<string>()

  for (const blk of monthBlocks) {
    const gridStart = blk.headerRow + 1
    for (let w = 0; w < 6; w++) {
      const dayRow = gridStart + w * 2
      for (let dow = 0; dow < 7; dow++) {
        const cell = ws.getCell(dayRow, blk.startCol + dow)
        const val = cell.value
        if (typeof val !== 'number' || !Number.isInteger(val)) continue
        const day = val
        if (day < 1 || day > 31) continue
        if (getFillArgb(cell) !== holidayColor) continue
        const iso = toIsoDate(year, blk.month, day)
        const wd = new Date(iso + 'T00:00:00').getDay()
        if (wd === 0 || wd === 6) continue
        results.add(iso)
      }
    }
  }

  const list = [...results].sort()
  return { year, holidayColor, nonWeekendHolidays: list }
}

// POST /api/calendar/import-government
router.post(
  '/import-government',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const f = (req as Request & { file?: Express.Multer.File }).file
      if (!f) return res.status(400).json({ message: '缺少上傳檔案（file）' })

      const parsed = await parseGovernmentCalendar(f.buffer)

      // 寫入前擋：這份清單同時是 VTMS 通知排程與負載圖的工作日來源，寫錯的代價
      // 遠大於請管理員確認檔案後重傳。回 ok:false 前端也就不會併進特定休息日。
      const abnormal = findAbnormalMonths(parsed.nonWeekendHolidays)
      if (abnormal.length > 0) {
        const detail = abnormal.map(a => `${a.month} 有 ${a.count} 個平日被判為放假`).join('、')
        return res.status(422).json({
          ok: false,
          message:
            `解析結果不合理：${detail}（單月上限 ${MAX_WEEKDAY_HOLIDAYS_PER_MONTH} 天）。` +
            '可能是檔案的填色與政府原檔不同，請確認檔案後再匯入。現有行事曆未變更。',
        })
      }

      // 併進全平台唯一的休息日清單（rest_days_config）。只新增不刪除：清單裡手動加的
      // 公司休假與其他年度的日期都要留著；匯入錯的日期由管理員在同一個畫面刪除。
      // 不再寫 calendar_config（2026-10-05 停用，見 specs/2026-10-05-unified-holiday-list-design.md）。
      const incoming = parsed.nonWeekendHolidays.map(d => d.replace(/-/g, '/'))
      const merged = await prisma.$transaction(async tx => {
        const row = await tx.restDaysConfig.findUnique({ where: { id: 1 } })
        const existing = new Set((row?.specificDates as string[] | undefined) ?? [])
        const added = incoming.filter(d => !existing.has(d))
        const specificDates = [...existing, ...added].sort()
        await tx.restDaysConfig.upsert({
          where: { id: 1 },
          create: { id: 1, weekends: true, specificDates },
          update: { weekends: true, specificDates },
        })
        return { added: added.length, specificDates }
      })

      return res.json({
        ok: true,
        year: parsed.year,
        detected: incoming.length,
        added: merged.added,
        skipped: incoming.length - merged.added,
        specificDates: merged.specificDates,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '匯入失敗'
      return res.status(500).json({ ok: false, message: msg })
    }
  }
)

export default router
