// src/lib/importImpact.ts
// Excel 匯入的影響評估。從 ExcelImportModal 抽出來，讓它可以被測試 ——
// 這段邏輯決定使用者按下「確認覆蓋」之前看到什麼數字，算錯的代價是整批資料消失。
import type { Schedule } from '../types'

/** 匯入檔的一列。欄位取自 parseImportFile 的輸出。 */
export interface IncomingRow {
  projectName: string
  taskDescription: string
  testEngineer: string
  startDate: string
  endDate: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  isCancelled: boolean
  delayReason: string
  device: string
  adminFlag: boolean
  adminFlagNote: string
  userFlag: boolean
  userFlagNote: string
}

export interface FieldDiff {
  field: string
  label: string
  oldVal: string
  newVal: string
}

export interface RecordDiff {
  projectName: string
  taskDescription: string
  diffs: FieldDiff[]
}

/**
 * 比對用的鍵：專案、工作內容、測試人員、起訖日期五個欄位全等才算同一筆。
 * 用 NUL 字元（\u0000）串接，避免欄位內容剛好含有分隔字元時把兩筆不同的排程算成同一筆。
 */
export function matchKey(r: {
  projectName: string; taskDescription: string; testEngineer: string
  startDate: string; endDate: string
}): string {
  return [r.projectName, r.taskDescription, r.testEngineer, r.startDate, r.endDate].join('\u0000')
}

const boolStr = (v: boolean) => (v ? '是' : '否')
const orBlank = (v: string) => v || '（空白）'

/** 兩筆同一個排程之間有差異的欄位。沒有差異時回傳空陣列。 */
export function fieldDiffs(row: IncomingRow, match: Schedule): FieldDiff[] {
  const diffs: FieldDiff[] = []
  if (row.testReport !== match.testReport)
    diffs.push({ field: 'testReport', label: '測試報告', oldVal: orBlank(match.testReport), newVal: orBlank(row.testReport) })
  if (row.isCompleted !== match.isCompleted)
    diffs.push({ field: 'isCompleted', label: '已完成', oldVal: boolStr(match.isCompleted), newVal: boolStr(row.isCompleted) })
  if (row.isDelayed !== match.isDelayed)
    diffs.push({ field: 'isDelayed', label: '延遲', oldVal: boolStr(match.isDelayed), newVal: boolStr(row.isDelayed) })
  if (row.isCancelled !== match.isCancelled)
    diffs.push({ field: 'isCancelled', label: '已取消', oldVal: boolStr(match.isCancelled), newVal: boolStr(row.isCancelled) })
  if (row.delayReason !== match.delayReason)
    diffs.push({ field: 'delayReason', label: '延遲原因', oldVal: orBlank(match.delayReason), newVal: orBlank(row.delayReason) })
  if (row.device !== (match.device ?? ''))
    diffs.push({ field: 'device', label: '設備', oldVal: match.device || '（無）', newVal: row.device || '（無）' })
  if (row.adminFlag !== (match.adminFlag ?? false))
    diffs.push({ field: 'adminFlag', label: 'Admin 旗標', oldVal: boolStr(match.adminFlag ?? false), newVal: boolStr(row.adminFlag) })
  if (row.adminFlagNote !== (match.adminFlagNote ?? ''))
    diffs.push({ field: 'adminFlagNote', label: 'Admin 旗標備註', oldVal: orBlank(match.adminFlagNote ?? ''), newVal: orBlank(row.adminFlagNote) })
  if (row.userFlag !== (match.userFlag ?? false))
    diffs.push({ field: 'userFlag', label: '用戶旗標', oldVal: boolStr(match.userFlag ?? false), newVal: boolStr(row.userFlag) })
  if (row.userFlagNote !== (match.userFlagNote ?? ''))
    diffs.push({ field: 'userFlagNote', label: '用戶旗標備註', oldVal: orBlank(match.userFlagNote ?? ''), newVal: orBlank(row.userFlagNote) })
  return diffs
}

/** 逐筆列出「同一筆排程但欄位有變動」的明細，供確認畫面展開檢視。 */
export function computeDiffs(incoming: IncomingRow[], existing: Schedule[]): RecordDiff[] {
  const byKey = new Map<string, Schedule>()
  for (const s of existing) byKey.set(matchKey(s), s)

  const result: RecordDiff[] = []
  for (const row of incoming) {
    const match = byKey.get(matchKey(row))
    if (!match) continue
    const diffs = fieldDiffs(row, match)
    if (diffs.length > 0) {
      result.push({ projectName: match.projectName, taskDescription: row.taskDescription, diffs })
    }
  }
  return result
}

export interface ReplaceImpact {
  /** 這次覆蓋會動到的既有排程筆數 */
  scopeTotal: number
  /** 不在覆蓋範圍內、完全不受影響的既有排程筆數 */
  outOfScope: number
  /** 匯入檔裡找不到對應既有排程的，會新建 */
  added: number
  /** 有對應且欄位有變動 */
  updated: number
  /** 有對應且完全相同 */
  unchanged: number
  /** 在覆蓋範圍內、但匯入檔裡沒有的既有排程 —— 這些會消失 */
  deleted: number
  /** 前幾筆將消失的排程名稱，讓人看得出刪掉的是什麼而不只是一個數字 */
  deletedSamples: string[]
}

const DELETED_SAMPLE_LIMIT = 8

/**
 * 覆蓋匯入會造成什麼後果。
 *
 * 舊版只在「找得到對應排程且欄位有差異」時才跳確認。匯入檔如果跟現有資料完全
 * 對不上（例如日期整批改過），差異清單是空的，程式就直接 replaceAll 把整批資料
 * 清掉換成新檔，中間沒有任何一步告訴使用者將刪除多少筆。這個函式就是為了讓那個
 * 數字先被算出來。
 *
 * 後端 `PUT /schedules/replace-all` 的刪除範圍依角色而異：
 *   - super_admin 或未設限的 admin → `deleteMany()`，刪掉全部
 *   - 有管轄單位的 admin → 只刪 `testUnit IN (管轄單位)`
 * 所以 allowedUnits 傳空陣列代表不設限，非空則只評估該範圍。
 */
export function computeReplaceImpact(
  incoming: IncomingRow[],
  existing: Schedule[],
  allowedUnits: string[] = [],
): ReplaceImpact {
  const unlimited = allowedUnits.length === 0
  const inScope = unlimited ? existing : existing.filter(s => allowedUnits.includes(s.testUnit))

  const existingByKey = new Map<string, Schedule>()
  for (const s of inScope) existingByKey.set(matchKey(s), s)

  const incomingKeys = new Set(incoming.map(matchKey))

  let added = 0
  let updated = 0
  let unchanged = 0
  for (const row of incoming) {
    const match = existingByKey.get(matchKey(row))
    if (!match) { added++; continue }
    if (fieldDiffs(row, match).length > 0) updated++
    else unchanged++
  }

  const deletedRows = inScope.filter(s => !incomingKeys.has(matchKey(s)))

  return {
    scopeTotal: inScope.length,
    outOfScope: existing.length - inScope.length,
    added,
    updated,
    unchanged,
    deleted: deletedRows.length,
    deletedSamples: deletedRows.slice(0, DELETED_SAMPLE_LIMIT).map(s => s.projectName),
  }
}
