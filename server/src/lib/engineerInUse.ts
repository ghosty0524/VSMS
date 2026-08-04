// server/src/lib/engineerInUse.ts
// 需求三：刪除仍被引用的人員時擋下。
//
// 人員的移除是透過 PUT /api/options 的全刪重建達成（不在請求 body 中即
// 等同刪除），這條路由沒有專屬的 DELETE 端點可以掛引用檢查，因此檢查邏輯
// 抽成純函式，由路由在進入交易前呼叫。

export interface MissingEngineer {
  /** 被引用但即將從 body 中消失的人員 value（同時也是 Schedule.testEngineer 存的字串） */
  value: string
  /** 引用該 value 的排程筆數 */
  count: number
}

/**
 * 找出「排程實際引用，但即將提交的 body 中已不存在」的人員 value。
 *
 * @param scheduleTestEngineerValues 目前所有排程的 testEngineer 欄位（可含空字串、重複值）
 * @param bodyEngineerValues PUT body 中所有人員的 value 集合
 */
export function findMissingReferencedEngineers(
  scheduleTestEngineerValues: string[],
  bodyEngineerValues: string[],
): MissingEngineer[] {
  const bodySet = new Set(bodyEngineerValues)
  const counts = new Map<string, number>()

  for (const value of scheduleTestEngineerValues) {
    if (!value) continue // 空字串代表尚未指派，不是對人員的引用
    if (bodySet.has(value)) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()].map(([value, count]) => ({ value, count }))
}

/** 組出引導使用者改用停用的錯誤訊息，列出每位人員的名稱與筆數 */
export function formatEngineerInUseMessage(missing: MissingEngineer[]): string {
  return missing
    .map(m => `「${m.value}」目前有 ${m.count} 筆排程使用中，無法刪除`)
    .join('；') + '。若該人員已離職，請改用「停用」。'
}
