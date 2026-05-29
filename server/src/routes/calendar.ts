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

      await prisma.calendarConfig.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          year: parsed.year,
          nonWeekendHolidays: parsed.nonWeekendHolidays,
          sourceName: f.originalname,
          updatedAt: new Date(),
        },
        update: {
          year: parsed.year,
          nonWeekendHolidays: parsed.nonWeekendHolidays,
          sourceName: f.originalname,
          updatedAt: new Date(),
        },
      })

      return res.json({
        ok: true,
        year: parsed.year,
        detectedHolidayColor: parsed.holidayColor,
        nonWeekendHolidayCount: parsed.nonWeekendHolidays.length,
        sample: parsed.nonWeekendHolidays.slice(0, 12),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '匯入失敗'
      return res.status(500).json({ ok: false, message: msg })
    }
  }
)

// GET /api/calendar/non-weekend-holidays
router.get('/non-weekend-holidays', async (req: Request, res: Response) => {
  const store = await prisma.calendarConfig.findUnique({ where: { id: 1 } })
  if (!store) return res.json({ year: null, nonWeekendHolidays: [] })

  const yearParam = Number(req.query.year)
  if (yearParam && store.year !== yearParam) {
    return res.json({ year: store.year, nonWeekendHolidays: [] })
  }

  return res.json({
    year: store.year,
    nonWeekendHolidays: (store.nonWeekendHolidays as string[]) ?? [],
  })
})

export default router
