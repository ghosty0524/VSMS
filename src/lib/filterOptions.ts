// src/lib/filterOptions.ts
//
// 篩選下拉選單的選項清單，必須是「資料中實際出現的值」∪「目前啟用中的設定值」。
// 停用（isActive=false）只該影響新增/編輯表單能選什麼，不該讓既有排程的
// 工作類別／測試單位／測試人員從篩選器裡消失，否則使用者找不到已停用人員
// 名下的舊排程（只能先重新啟用才能搜尋，這正是本模組要修的迴歸）。
//
// 同時也收錄「孤兒值」──資料裡有、但已無對應設定的值（例如人員被刪除、
// 而非只是停用）。這類值一樣要能被篩選到，只是不會被標記為「已停用」。

export interface ConfiguredOption {
  value: string
  isActive: boolean
}

/**
 * 選項清單 = 啟用中的設定值 ∪ 資料中實際使用的值（含孤兒值），去重。
 */
export function buildFilterOptions(
  configured: ConfiguredOption[],
  usedValues: Iterable<string>,
): string[] {
  const result = new Set<string>()
  for (const o of configured) {
    if (o.isActive) result.add(o.value)
  }
  for (const v of usedValues) {
    if (v) result.add(v)
  }
  return Array.from(result)
}

/**
 * 已停用（但因歷史資料而仍出現在選項清單中）的值集合，供 UI 標示「（已停用）」。
 * 只涵蓋「有設定、但 isActive=false」的值；孤兒值（不在 configured 中）
 * 不會出現在這個集合裡 —— 我們無法得知它曾經是啟用還是停用。
 */
export function buildInactiveValueSet(configured: ConfiguredOption[]): Set<string> {
  return new Set(configured.filter(o => !o.isActive).map(o => o.value))
}

export interface EngineerHolder {
  value: string
  engineers: ConfiguredOption[]
}

export interface EngineerScheduleLike {
  testUnit: string
  testEngineer: string
}

/**
 * 測試人員選項清單：比照 buildFilterOptions，但先依「選取的測試單位」narrow
 * 設定與資料兩邊的來源，讓清單不會混入使用者已篩選掉之單位的人員。
 * selectedUnits 為空陣列時視為「不限單位」。
 */
export function buildEngineerFilterOptions(
  testUnits: EngineerHolder[],
  schedules: EngineerScheduleLike[],
  selectedUnits: string[],
): string[] {
  const narrowedUnits = testUnits.filter(
    u => selectedUnits.length === 0 || selectedUnits.includes(u.value),
  )
  const configuredEngineers = narrowedUnits.flatMap(u => u.engineers)
  const usedEngineers = schedules
    .filter(s => selectedUnits.length === 0 || selectedUnits.includes(s.testUnit))
    .map(s => s.testEngineer)
  return buildFilterOptions(configuredEngineers, usedEngineers)
}

/** buildInactiveValueSet 的測試人員版本：同樣先依選取單位 narrow 設定來源。 */
export function buildEngineerInactiveValueSet(
  testUnits: EngineerHolder[],
  selectedUnits: string[],
): Set<string> {
  const narrowedUnits = testUnits.filter(
    u => selectedUnits.length === 0 || selectedUnits.includes(u.value),
  )
  return buildInactiveValueSet(narrowedUnits.flatMap(u => u.engineers))
}

/**
 * 由選項清單 + 停用值集合，組出給 MultiSelectDropdown/MultiSelect 用的
 * 顯示標籤對照表：停用值加註「（已停用）」，其餘（含孤兒值）維持原樣。
 */
export function buildOptionLabels(options: string[], inactive: Set<string>): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const v of options) {
    labels[v] = inactive.has(v) ? `${v}（已停用）` : v
  }
  return labels
}
