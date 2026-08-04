// src/lib/tsv.ts
// 純函式：把排程陣列轉為可貼上 Excel／Google 試算表／郵件用戶端的 TSV 字串。
// 供列表視圖的「複製表格」按鈕使用；欄位與順序需與 ScheduleListView 顯示的
// 十欄一致（不含操作欄），詳見 docs/superpowers/specs 需求五。
import { computeStatus } from './status'
import type { Schedule } from '../types'

export const TSV_HEADERS = [
  '狀態', '工作類別', 'PDN Number', '工作內容', '測試單位', '測試人員',
  '起始日', '完成日', '需求人員', '測試報告',
] as const

// 欄位內容裡的 tab／換行（含 \r\n）會被試算表當成欄位／列的分隔字元，
// 貼上時整份表格會錯位或多出空列，因此一律替換為單一空白。
// taskDescription 是自由輸入文字，是最常見的破壞來源。
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ')
}

/**
 * 將排程陣列轉為 TSV 字串（第一列為標題列，其餘每列對應一筆排程）。
 *
 * @param schedules 已篩選、排序完成的排程陣列（呼叫端需自行決定「全部」的範圍，
 *   此函式不做任何截斷——這正是它存在的理由：避免只複製到虛擬化畫面上的可視列）。
 * @param engLabel 把 testEngineer 的 value 轉成顯示名稱，與列表畫面一致。
 * @returns TSV 字串；schedules 為空陣列時回傳空字串，而非只有標題列的輸出——
 *   後者會讓使用者誤以為「複製成功」但貼上後其實什麼資料都沒有。
 */
export function schedulesToTsv(
  schedules: Schedule[],
  engLabel: (value: string) => string,
): string {
  if (schedules.length === 0) return ''

  const rows = schedules.map(s => {
    const cells = [
      computeStatus(s),          // 狀態：文字，不含 STATUS_GLYPH 符號
      s.category,                // 工作類別
      s.projectName,             // PDN Number
      s.taskDescription,         // 工作內容
      s.testUnit,                // 測試單位
      engLabel(s.testEngineer),  // 測試人員（顯示名稱）
      s.startDate,               // 起始日（原樣輸出）
      s.endDate,                 // 完成日（原樣輸出）
      s.requiredPersonnel,       // 需求人員
      s.testReport,              // 測試報告
    ]
    return cells.map(sanitizeCell).join('\t')
  })

  return [TSV_HEADERS.join('\t'), ...rows].join('\n')
}
