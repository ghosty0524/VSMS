// src/lib/optionsErrors.ts
// 需求三（前端）：PUT /api/options 現在可能因 ENGINEER_IN_USE 而回 400，但後端
// 訊息是針對「刪除人員」措辭的（例如「Alice_Wu」目前有 N 筆排程使用中…）。
// 若使用者實際操作的是刪除整個測試單位（單位刪除會連帶把底下所有人員也從
// body 中移除），照搬後端原文會讓人誤以為自己點錯了對象。這裡在單位刪除路徑
// 加一句「單位為什麼刪不掉」的說明，再把後端原文原封不動接在後面當作細節。
export function formatUnitDeleteError(unitLabel: string, backendMessage: string): string {
  return `無法刪除測試單位「${unitLabel}」，因為其人員仍被排程引用：${backendMessage}`
}
