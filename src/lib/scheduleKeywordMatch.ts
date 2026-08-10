// src/lib/scheduleKeywordMatch.ts
//
// 排程關鍵字搜尋：判斷單一排程是否命中搜尋關鍵字。
// testEngineer 存的是不會變動的 value（識別碼），畫面上顯示的是可能改名的
// label；只比對 value 會讓使用者用「目前的名字」搜尋不到人（尤其是已停用
// 工程師的舊排程——這正是本模組要修的迴歸）。因此關鍵字同時比對 value 與
// resolveEngineerLabel(value) 兩者，value 沒有對應 label 時 resolveEngineerLabel
// 應退回原始 value，此時只會比對到一次，不會重複比對或出錯。
//
// ⚠ src/dashboard/script.ts 內的 DASHBOARD_JS 有一份同規則的 vanilla JS 複本
// （getFiltered 內的 state.projectSearch 比對邏輯）。匯出的 HTML 需離線運作、
// 無法 import 此檔，故必須複製邏輯。修改本檔的比對規則時，請同步更新
// script.ts 那一份，保持行為一致。
import type { Schedule } from '../types'

/**
 * 關鍵字是否命中排程。比對欄位：projectName、taskDescription、
 * requiredPersonnel、testReport，以及 testEngineer 的 value 與其目前的
 * label（改名場景，見上方模組說明）。
 * 大小寫不敏感、子字串比對；空白（或全空白）關鍵字視為全部命中。
 */
export function matchesKeyword(
  schedule: Schedule,
  keyword: string,
  resolveEngineerLabel: (value: string) => string,
): boolean {
  if (!keyword.trim()) return true
  const kw = keyword.toLowerCase()
  const engineerLabel = schedule.testEngineer ? resolveEngineerLabel(schedule.testEngineer) : ''
  const target = [
    schedule.projectName,
    schedule.taskDescription,
    schedule.requiredPersonnel,
    schedule.testReport,
    schedule.testEngineer,
    engineerLabel,
  ].join(' ').toLowerCase()
  return target.includes(kw)
}
