// server/src/lib/changeHistory.ts
// 排程變動歷程（change_history 表）：讓小P+ 回答「誰、什麼時候、從什麼改成什麼」。
// 設計：F:\copilot-agent\specs\2026-10-01-change-history-design.md
//
// 記值原則：下拉、勾選、日期、數字、識別碼記前後值（存顯示值）；手填文字只記
// { changed: true }，changes 裡絕不放原文。舊的 audit_logs 照寫，兩者互不取代。

export type ChangeAction =
  | 'create' | 'update' | 'flag' | 'delete' | 'import'
  | 'link' | 'unlink' | 'delay' | 'complete'

export type ActorSource = 'user' | 'vtms-sync' | 'system'

/** 寫進 changes 的顯示值；空值一律為 null。 */
export type DisplayValue = string | number | null

export type ValueChange = { field: string; label: string; before: DisplayValue; after: DisplayValue }
export type TextChange = { field: string; label: string; changed: true }
export type FieldChange = ValueChange | TextChange

/** 比對需要的排程欄位。Prisma 的 Schedule 列可以直接傳入（多的欄位不影響）。 */
export type ScheduleSnapshot = {
  id: string
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: number
  startDate: string
  endDate: string
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  isCancelled: boolean
  delayReason: string
  adminFlag: boolean
  adminFlagNote: string | null
  userFlag: boolean
  userFlagNote: string | null
  device: string
  vtmsPlanId: string | null
}

type FieldSpec = { field: keyof ScheduleSnapshot; label: string; kind: 'value' | 'text' }

// 欄位規格表：順序就是 changes 陣列的順序。value = 記前後值；text = 手填欄位，只記有改。
// 新增可寫欄位時要加進這裡，否則該欄位的修改不會留下歷程（測試守著這份清單）。
export const SCHEDULE_FIELD_SPECS: readonly FieldSpec[] = [
  { field: 'category',          label: '類別',           kind: 'value' },
  { field: 'projectName',       label: '專案名稱',       kind: 'value' },
  { field: 'device',            label: '設備',           kind: 'value' },
  { field: 'testUnit',          label: '測試單位',       kind: 'value' },
  { field: 'testEngineer',      label: '測試人員',       kind: 'value' },
  { field: 'timeResource',      label: '工時',           kind: 'value' },
  { field: 'startDate',         label: '開始日',         kind: 'value' },
  { field: 'endDate',           label: '結束日',         kind: 'value' },
  { field: 'isCompleted',       label: '完成',           kind: 'value' },
  { field: 'isDelayed',         label: '延遲',           kind: 'value' },
  { field: 'isCancelled',       label: '取消',           kind: 'value' },
  { field: 'adminFlag',         label: '主管旗標',       kind: 'value' },
  { field: 'userFlag',          label: '使用者旗標',     kind: 'value' },
  { field: 'vtmsPlanId',        label: 'VTMS 關聯計畫',  kind: 'value' },
  { field: 'taskDescription',   label: '任務說明',       kind: 'text' },
  { field: 'requiredPersonnel', label: '需求人員',       kind: 'text' },
  { field: 'delayReason',       label: '延遲原因',       kind: 'text' },
  { field: 'testReport',        label: '測試報告',       kind: 'text' },
  { field: 'adminFlagNote',     label: '主管旗標備註',   kind: 'text' },
  { field: 'userFlagNote',      label: '使用者旗標備註', kind: 'text' },
]

/** 新增／匯入時只記這些關鍵欄位的初始值（設計：create 不列全部欄位）。 */
export const CREATE_FIELDS: readonly (keyof ScheduleSnapshot)[] = [
  'category', 'projectName', 'device', 'testUnit', 'testEngineer', 'timeResource', 'startDate', 'endDate',
]

/** 只動到這些欄位的修改記為 flag，與 audit_logs 的 FLAG_SCHEDULE 判斷一致。 */
export const FLAG_FIELDS: readonly string[] = ['adminFlag', 'adminFlagNote', 'userFlag', 'userFlagNote']

// PDN 解析規則與 VTMS（計畫 B）、MCP（計畫 C）完全相同，改這裡要三邊一起改。
// 分隔可為 - _ 空格或沒有、不分大小寫；第 7 位還是數字就不算（PDN2500481 不是 PDN-250048）。
const PDN_PATTERN = /PDN[-_ ]?(\d{6})(?!\d)/i

/** 取第一個匹配，輸出一律 `PDN-` 加 6 位數。解析不出（例如「PDN 待 PM 提供」）回 null。 */
export function parsePdn(projectName: string | null | undefined): string | null {
  const m = PDN_PATTERN.exec(projectName ?? '')
  return m ? `PDN-${m[1]}` : null
}

/**
 * `{projectName} / {category} / {testEngineer}`，空的段落省略。
 * 刻意不放任務說明或任何手填文字：label 會在每一列重複出現，放了就等於把手填內容存進歷程。
 */
export function scheduleEntityLabel(s: { projectName: string; category: string; testEngineer: string }): string {
  return [s.projectName, s.category, s.testEngineer]
    .map(v => (v ?? '').trim())
    .filter(v => v !== '')
    .join(' / ')
}

type Raw = string | number | boolean | null | undefined

// NULL、undefined、'' 都是「沒有值」：旗標備註在 DB 是 NULL、前端送 ''，不能算成修改。
function normalize(v: Raw): string | number | boolean {
  return v === null || v === undefined ? '' : v
}

function toDisplay(field: string, v: string | number | boolean, planNames: Record<string, string>): DisplayValue {
  if (v === '') return null
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (field === 'vtmsPlanId' && typeof v === 'string') return planNames[v] ?? v
  return v
}

/** 比對修改前後，回傳有變動的欄位（依規格表順序）。planNames 是 VTMS 計畫 id → 名稱。 */
export function diffSchedule(
  before: ScheduleSnapshot,
  after: ScheduleSnapshot,
  planNames: Record<string, string> = {},
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const { field, label, kind } of SCHEDULE_FIELD_SPECS) {
    const b = normalize(before[field] as Raw)
    const a = normalize(after[field] as Raw)
    if (b === a) continue
    changes.push(kind === 'text'
      ? { field, label, changed: true }
      : { field, label, before: toDisplay(field, b, planNames), after: toDisplay(field, a, planNames) })
  }
  return changes
}

/** 新增／匯入：關鍵欄位的初始值，before 一律 null。 */
export function createChanges(after: ScheduleSnapshot): FieldChange[] {
  return SCHEDULE_FIELD_SPECS
    .filter(s => CREATE_FIELDS.includes(s.field))
    .map(({ field, label }) => ({
      field, label, before: null, after: toDisplay(field, normalize(after[field] as Raw), {}),
    }))
}
