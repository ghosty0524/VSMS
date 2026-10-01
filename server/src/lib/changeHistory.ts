// server/src/lib/changeHistory.ts
// 排程變動歷程（change_history 表）：讓小P+ 回答「誰、什麼時候、從什麼改成什麼」。
// 設計：F:\copilot-agent\specs\2026-10-01-change-history-design.md
//
// 記值原則：下拉、勾選、日期、數字、識別碼記前後值（存顯示值）；手填文字只記
// { changed: true }，changes 裡絕不放原文。舊的 audit_logs 照寫，兩者互不取代。

import { v4 as uuidv4 } from 'uuid'
import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'
import { getTestPlanProgressBatch } from './vtmsClient.js'

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

// ── 寫入 ──────────────────────────────────────────────────────

export type RecordChangeInput = {
  action: ChangeAction
  actor: string
  actorSource: ActorSource
  /** 修改前；新增／匯入為 null。 */
  before: ScheduleSnapshot | null
  /** 修改後；刪除為 null。 */
  after: ScheduleSnapshot | null
}

const ACTOR_MAX = 100
const LABEL_MAX = 500

/** 退版開關：CHANGE_HISTORY_ENABLED=false（不分大小寫）時完全不寫入。每次呼叫都重讀環境變數。 */
export function isChangeHistoryEnabled(): boolean {
  return (process.env.CHANGE_HISTORY_ENABLED ?? '').trim().toLowerCase() !== 'false'
}

/** 查 VTMS 計畫名稱的上限。vtmsClient 本身逾時是 10 秒，不能讓排程操作卡那麼久。 */
export const PLAN_NAME_TIMEOUT_MS = 3000

/**
 * VTMS 計畫 id → 名稱。走既有的 progress-batch 整合 API（排程的 VTMS 進度也走它），
 * 不跨庫讀 vtms.test_plans。查不到（VTMS 停機、逾時、計畫已刪）就不放進結果，
 * 呼叫端退回存 id。
 */
export async function resolvePlanNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))]
  if (wanted.length === 0) return {}
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('plan name lookup timed out')), PLAN_NAME_TIMEOUT_MS)
    })
    const batch = await Promise.race([getTestPlanProgressBatch(wanted), timeout])
    const names: Record<string, string> = {}
    for (const id of wanted) {
      const name = batch[id]?.planName
      if (name) names[id] = name
    }
    return names
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

function clip(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('')
}

async function buildEntry(input: RecordChangeInput): Promise<Prisma.ChangeHistoryCreateManyInput | null> {
  const { before, after } = input
  const subject = after ?? before
  if (!subject) return null

  let action = input.action
  let changes: FieldChange[]
  if (action === 'delete') {
    changes = []
  } else if (!before) {
    changes = createChanges(subject)
  } else {
    if (!after) return null
    const planChanged = (before.vtmsPlanId ?? null) !== (after.vtmsPlanId ?? null)
    const planNames = planChanged ? await resolvePlanNames([before.vtmsPlanId, after.vtmsPlanId]) : {}
    changes = diffSchedule(before, after, planNames)
    if (changes.length === 0) return null
    if (action === 'update' && changes.every(c => FLAG_FIELDS.includes(c.field))) action = 'flag'
  }

  return {
    id: uuidv4(),
    at: new Date(),
    pdn: parsePdn(subject.projectName),
    projectLabel: clip(subject.projectName ?? '', LABEL_MAX),
    entityType: 'schedule',
    entityId: subject.id,
    entityLabel: clip(scheduleEntityLabel(subject), LABEL_MAX),
    // 解除關聯後 vtmsPlanId 是 null，planId 記被解除的那個計畫
    planId: subject.vtmsPlanId ?? before?.vtmsPlanId ?? null,
    action,
    actor: clip(input.actor.trim() || 'unknown', ACTOR_MAX),
    actorSource: input.actorSource,
    changes: changes as unknown as Prisma.InputJsonValue,
  }
}

/** 一次寫多筆（整批匯入、計畫完成）。失敗只留 log，絕不往外丟、不影響原本的操作。 */
export async function recordChanges(inputs: RecordChangeInput[]): Promise<void> {
  if (!isChangeHistoryEnabled() || inputs.length === 0) return
  try {
    const built = await Promise.all(inputs.map(buildEntry))
    const data = built.filter((e): e is Prisma.ChangeHistoryCreateManyInput => e !== null)
    if (data.length === 0) return
    await prisma.changeHistory.createMany({ data })
  } catch (err) {
    console.error('change_history_error', {
      actions: [...new Set(inputs.map(i => i.action))].join(','),
      entityIds: inputs.slice(0, 5).map(i => (i.after ?? i.before)?.id).join(','),
      count: inputs.length,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export function recordChange(input: RecordChangeInput): Promise<void> {
  return recordChanges([input])
}

// ── 保留期 ────────────────────────────────────────────────────
// 用固定天數（不是 audit 的兩個曆月）：設計寫的是 365 天，環境變數也以天為單位。
// 清除與寫入開關無關：CHANGE_HISTORY_ENABLED=false 只停寫入，既有紀錄照保留期清。

export const DEFAULT_CHANGE_HISTORY_RETENTION_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

export function changeHistoryRetentionDays(
  raw: string | undefined = process.env.CHANGE_HISTORY_RETENTION_DAYS,
): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CHANGE_HISTORY_RETENTION_DAYS
}

export function changeHistoryRetentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

export async function purgeOldChangeHistory(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.changeHistory.deleteMany({
    where: { at: { lt: changeHistoryRetentionCutoff(now, changeHistoryRetentionDays()) } },
  })
  return count
}

export function scheduleChangeHistoryCleaner(): void {
  const run = () => {
    purgeOldChangeHistory()
      .then(n => {
        if (n > 0) console.log(`[change-history] purged ${n} row(s) older than ${changeHistoryRetentionDays()} days`)
      })
      .catch(err => console.error('[change-history] purge failed:', err))
  }
  run()
  setInterval(run, DAY_MS).unref()
}
