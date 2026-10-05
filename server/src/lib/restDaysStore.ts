import { prisma } from './db.js'
import { parseHolidayJson, normalizeRestDatesForWrite } from './holidays.js'

/**
 * 休息日清單（rest_days_config.specificDates）唯一的寫入路徑：單筆新增／刪除與政府日曆匯入
 * 都經過 updateRestDates。PUT /api/options 不再寫這份清單——它會把設定頁載入時的舊快照整份
 * 送回來，別的分頁一存檔就把剛改的日期蓋掉。規格：docs/superpowers/specs/2026-10-05-rest-days-hardening-design.md
 */

/** 既有清單有不合法的項目：寫入端不能默默丟掉（會吃掉管理員的資料），整個操作拒絕。 */
export class InvalidStoredHolidaysError extends Error {
  constructor(readonly bad: string[]) {
    super(`休息日清單有格式不合的日期：${bad.join('、')}`)
  }
}

/**
 * 寫入端讀既有清單：正規化成 YYYY/MM/DD、排序、去重；壞 JSON、非陣列拋錯，有不合法項目丟
 * InvalidStoredHolidaysError。讀取端（holidays.ts 的 readHolidays）是略過壞項目並 warn；
 * 寫入端要嚴格，因為結果會被寫回去。
 */
export function parseStoredRestDates(raw: unknown): string[] {
  const norm = normalizeRestDatesForWrite(parseHolidayJson(raw))
  if (!norm.ok) throw new InvalidStoredHolidaysError(norm.bad)
  return norm.dates
}

// VSMS 是單一 process（pm2 fork 模式），休息日的寫入全部在這條佇列上排隊：
// 新增、刪除、匯入同時進來時，後者一定讀到前者寫完的清單，不會互相蓋掉。
// 不用 SELECT … FOR UPDATE：Prisma 沒有原生支援，改用 raw SQL 會讓所有測試都得 mock raw query。
let queue: Promise<unknown> = Promise.resolve()

export function updateRestDates(
  mutate: (dates: string[]) => string[],
): Promise<{ before: string[]; after: string[] }> {
  const run = queue.then(() => prisma.$transaction(async tx => {
    const row = await tx.restDaysConfig.findUnique({ where: { id: 1 } })
    // initDb 開機時會建這一列；缺列代表資料被動過，不能當成「沒有假日」
    if (!row) throw new Error('rest_days_config 沒有 id=1 的列')
    const before = parseStoredRestDates(row.specificDates)
    const after = [...new Set(mutate(before))].sort()
    const changed = after.length !== before.length || after.some((d, i) => d !== before[i])
    if (changed) {
      await tx.restDaysConfig.upsert({
        where: { id: 1 },
        create: { id: 1, weekends: true, specificDates: after },
        update: { weekends: true, specificDates: after },
      })
    }
    return { before, after }
  }))
  // 失敗也要讓佇列往下走，否則一次錯誤會卡死之後所有寫入
  queue = run.catch(() => undefined)
  return run
}
