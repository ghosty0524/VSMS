import { prisma } from './db.js'

/**
 * 全平台唯一的假日清單：rest_days_config.specificDates（設定頁「特定休息日」）。
 * VSMS、VTMS、MCP 都只讀這一份；週六日一律休息，不在清單裡。
 * 規格：docs/superpowers/specs/2026-10-05-unified-holiday-list-design.md
 *
 * 2026-10 以前另有一份 calendar_config（政府日曆匯入）供負載圖與 VTMS 使用，兩份各錯
 * 一天、設定頁改的不會生效到 VTMS，10 月整片誤判的資料因此藏了半年。別再開第二份。
 */
export interface HolidayList {
  /** ISO YYYY-MM-DD，排序、去重 */
  dates: string[]
  /** 清單中出現過的年度；不在這裡的年度＝那年的假日還沒匯入 */
  years: Set<number>
}

const DATE_RE = /^(\d{4})[/-](\d{2})[/-](\d{2})$/

/** 'YYYY/MM/DD' 或 'YYYY-MM-DD' → ISO；格式不合或不是真實日期回 null。 */
export function toIsoHoliday(value: string): string | null {
  const m = DATE_RE.exec(value.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    return null
  }
  return `${y}-${mo}-${d}`
}

export function normalizeHolidayDates(raw: unknown): HolidayList {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw) as unknown
    } catch (err) {
      throw new Error(`rest_days_config.specificDates 不是合法的 JSON：${(err as Error).message}`, { cause: err })
    }
  }
  if (!Array.isArray(arr)) throw new Error('rest_days_config.specificDates 不是陣列')

  const set = new Set<string>()
  for (const v of arr) {
    const iso = typeof v === 'string' ? toIsoHoliday(v) : null
    // 單筆手誤不該讓整份清單失效：略過並留下紀錄，寫入端（options PUT）擋新的錯誤資料
    if (iso) set.add(iso)
    else console.warn('[holidays] 略過格式不合的休息日：', JSON.stringify(v))
  }
  const dates = [...set].sort()
  return { dates, years: new Set(dates.map(d => Number(d.slice(0, 4)))) }
}

export async function readHolidays(): Promise<HolidayList> {
  const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
  // initDb 開機時就會建這一列；缺列代表資料被動過，不能當成「沒有假日」繼續算
  if (!row) throw new Error('rest_days_config 沒有 id=1 的列')
  return normalizeHolidayDates(row.specificDates)
}

export function uncoveredYearNote(year: number): string {
  return `行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`
}

/** 設定頁存檔用：兩種格式都收、一律存成 YYYY/MM/DD；任一筆不合法就整份拒絕。 */
export function normalizeRestDatesForWrite(raw: unknown):
  | { ok: true; dates: string[] }
  | { ok: false; bad: string[] } {
  if (!Array.isArray(raw)) return { ok: false, bad: [String(raw)] }
  const bad: string[] = []
  const set = new Set<string>()
  for (const v of raw) {
    const iso = typeof v === 'string' ? toIsoHoliday(v) : null
    if (iso) set.add(iso.replace(/-/g, '/'))
    else bad.push(String(v))
  }
  return bad.length > 0 ? { ok: false, bad } : { ok: true, dates: [...set].sort() }
}
