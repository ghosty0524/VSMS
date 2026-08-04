// src/lib/clipboardTable.ts
// 純函式：把排程陣列轉為兩種可貼上剪貼簿的表格表示法——
// text/plain 的 TSV（Excel／Google 試算表用）與 text/html 的 <table>（Word／Outlook／
// Google Docs 用）。純文字 TSV 只有試算表類應用程式會把 tab 解析成欄位，文書處理器
// 只會貼出帶 tab 字元的一整行文字，因此另外準備一份 HTML 表格，讓貼上的應用程式
// 各自選用它看得懂的格式。
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
// HTML 表格雖然不受 tab／換行影響儲存格邊界，但沿用同一份 sanitizeCell，
// 讓 TSV 與 HTML 這兩種輸出對同一筆資料的顯示內容永遠一致（需求二）。
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ')
}

// HTML 是由接收端應用程式（Word／Outlook／瀏覽器）解析並渲染的標記語言，
// 未跳脫的 &、< 、> 會被當成實體參照或標籤起點，破壞表格結構甚至混入
// 非預期內容。taskDescription 為自由輸入文字，是最常見的破壞來源。
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 把單筆排程轉成十個已 sanitize（但未跳脫 HTML）的儲存格字串，供 TSV 與
// HTML 兩個 formatter 共用，確保欄位與順序不會因為兩處各自維護而分岔。
function scheduleToCells(
  s: Schedule,
  engLabel: (value: string) => string,
): string[] {
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
  return cells.map(sanitizeCell)
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

  const rows = schedules.map(s => scheduleToCells(s, engLabel).join('\t'))

  return [TSV_HEADERS.join('\t'), ...rows].join('\n')
}

/**
 * 將排程陣列轉為 HTML `<table>` 字串（`<thead>` 為標題列，`<tbody>` 每列對應
 * 一筆排程），供貼到 Word／Outlook／Google Docs 等文書處理器時能還原成真正
 * 的表格，而非帶 tab 字元的純文字。
 *
 * 欄位、順序與標題文字與 {@link schedulesToTsv} 完全一致——兩者是同一份資料的
 * 兩種表示法，不應各自維護而導致分岔（需求二）。僅套用最小的行內樣式（collapse
 * 邊框與儲存格留白），不重現 App 介面的顏色（需求四）。
 *
 * @returns HTML 字串；schedules 為空陣列時回傳空字串，與 {@link schedulesToTsv}
 *   的「空清單不寫入任何內容」行為一致。
 */
export function schedulesToHtmlTable(
  schedules: Schedule[],
  engLabel: (value: string) => string,
): string {
  if (schedules.length === 0) return ''

  const cellStyle = 'border:1px solid #999;padding:4px 8px;text-align:left'

  const headerHtml = TSV_HEADERS
    .map(h => `<th style="${cellStyle}">${escapeHtml(h)}</th>`)
    .join('')

  const rowsHtml = schedules
    .map(s => {
      const cellsHtml = scheduleToCells(s, engLabel)
        .map(cell => `<td style="${cellStyle}">${escapeHtml(cell)}</td>`)
        .join('')
      return `<tr>${cellsHtml}</tr>`
    })
    .join('')

  return (
    `<table style="border-collapse:collapse">` +
      `<thead><tr>${headerHtml}</tr></thead>` +
      `<tbody>${rowsHtml}</tbody>` +
    `</table>`
  )
}
