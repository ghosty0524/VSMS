// src/types.ts

// Session 角色。guest 為虛擬唯讀帳號（不存在於 users 表）
export type Role = 'super_admin' | 'admin' | 'user' | 'guest'

export interface Schedule {
  id: string
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: number
  startDate: string        // YYYY/MM/DD
  endDate: string          // YYYY/MM/DD
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  isCancelled: boolean
  completedAt: string | null
  delayReason: string
  createdBy: string
  updatedBy: string
  createdAt: string        // ISO 8601
  updatedAt: string        // ISO 8601
  adminFlag:     boolean
  adminFlagNote: string
  userFlag:      boolean
  userFlagNote:  string
  device:        string
  vtmsPlanId?: string
}

export interface Option {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
}

/** 工作類別在統計中的計入方式。'workload_only' 不計專案數但仍計人力負載。 */
export type CategoryStatsMode = 'counted' | 'workload_only' | 'excluded'

export interface CategoryOption extends Option {
  statsMode: CategoryStatsMode
}

export interface EngineerOption extends Option {
  color?: string | null
}

export interface TestUnitOption extends Option {
  color?: string | null
  /** 所屬部門；null 或 undefined = 自成一部（舊後端不回這個欄位） */
  department?: string | null
  engineers: EngineerOption[]
}

export interface RestDaysConfig {
  weekends: boolean
  specificDates: string[]  // YYYY/MM/DD
}

export interface OptionsMap {
  categories: CategoryOption[]
  testUnits: TestUnitOption[]
  restDays: RestDaysConfig
  devices: Option[]
}

export interface User {
  id: string
  username: string
  displayName: string      // 選填，預設等於 username
  passwordHash: string     // SHA-256
  role: 'super_admin' | 'admin' | 'user'
  isActive: boolean
  allowedUnits: string[]
  linkedEngineer: string
  createdAt: string
  lastLoginAt: string
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
}

export interface UserStore {
  users: User[]
}

export interface AuditLog {
  id: string
  timestamp: string
  username: string
  displayName: string
  action: AuditAction
  target: string
  fields: string[]
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_SCHEDULE'
  | 'UPDATE_SCHEDULE'
  | 'DELETE_SCHEDULE'
  | 'IMPORT_SCHEDULES'
  | 'EXPORT_DASHBOARD'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'UPDATE_SETTINGS'
  | 'FLAG_SCHEDULE'
  | 'ORG_SYNC'

export type View = 'main' | 'analytics' | 'settings' | 'audit' | 'accounts'

export interface ScheduleFormValues {
  category: string
  projectName: string
  taskDescription: string
  testUnit: string
  testEngineer: string
  timeResource: string
  startDate: Date | null
  endDate: Date | null
  requiredPersonnel: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  isCancelled: boolean
  delayReason: string
  device: string          // 設備 value，空字串表示未指定
}

export interface VtmsProgressResults {
  pass: number
  fail: number
  conditional_pass: number
  blocked: number
  not_tested: number
  not_applicable: number
}

export interface VtmsProgress {
  planId: string
  planName: string
  planStatus: string
  totalItems: number
  latestRunStatus: string | null
  results: VtmsProgressResults
  completionPct: number
}

export interface VtmsTestPlan {
  id: string
  name: string
  projectId: string
  projectName: string
  status: string
  plannedStartDate: string | null
  plannedEndDate: string | null
  assignees: string[]
}

/** GET /api/schedules/vtms-project-check 的回應。unavailable 是 200 不是錯誤。 */
export type VtmsProjectCheck =
  | { status: 'found'; name: string; planCount: number }
  | { status: 'not_found'; similar: string[] }
  | { status: 'unavailable' }

export interface NotifyConfig {
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
  smtpConfigured: boolean
  /** 需求人員無法對應為信箱時的代收群組；停用者也會回傳，供設定頁顯示。 */
  fallbackRecipients: FallbackRecipient[]
  templateVars: string[]
}

export interface NotifyRule {
  id: string
  /** null = 預設規則 */
  testUnit: string | null
  enabled: boolean
  /** null = 沿用預設規則；空字串 = 刻意留白 */
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
  ccRecipients: string
}

export interface FallbackRecipient {
  id: string
  /** 公司帳號名或完整 email；存檔時已驗證過能組成有效信箱。 */
  name: string
  note: string
  isActive: boolean
}

export interface NotifyLog {
  id: string
  scheduleId: string
  sendDate: string
  /**
   * 'sent'／'failed'／'failed_permanent' 是平台寄送層上線前的舊值，保留
   * 相容舊列；'accepted'／'dedup'／'error' 是現在本地會寫入的狀態，代表
   * 「有沒有成功交給平台」，不代表信真的寄出了——那要看 platformStatus。
   */
  status: 'sent' | 'failed' | 'failed_permanent' | 'accepted' | 'dedup' | 'error'
  recipients: string
  errorMessage: string | null
  attempts: number
  /** 寄件伺服器回傳的訊息 ID；平台寄送層上線後固定為 null。 */
  messageId: string | null
  /** SMTP 原始回應；平台寄送層上線後固定為 null。 */
  smtpResponse: string | null
  sentAt: string | null
  createdAt: string
  /** 平台目前的寄送狀態（由 GET /notify/deliveries 合併回來）；平台連不上或這筆還沒有 deliveryId 時為 null。 */
  platformStatus?: 'queued' | 'sent' | 'failed' | 'failed_permanent' | string | null
  /** 平台記錄的最後一次錯誤訊息。 */
  platformError?: string | null
  /** 平台記錄的實際寄出時間。 */
  platformSentAt?: string | null
  /**
   * 最後一次處理這筆通知的時間；記錄頁的排序依據，也是畫面上顯示的那一欄。
   * 標為選填是因為 dist 由磁碟即時服務、後端要重啟才生效，兩者之間必然有一段
   * 新前端搭舊後端的時間，那時這個欄位不存在。
   */
  updatedAt?: string
  /** 排程已刪除時為空字串。 */
  projectName: string
  testUnit: string
  startDate: string
}

export interface NotifyPreview {
  subject: string
  text: string
  html: string
  to: string[]
  cc: string[]
  unresolved: string[]
  sendDate: string | null
  unitEnabled: boolean
}

export interface NotifyRunResult {
  ok: boolean
  checked: number
  due: number
  sent: number
  failed: number
  skipped: number
  missedWindow: number
  /** 因排除規則（佔位專案編號、需求人員本身是 VSMS 帳號）而不寄的筆數。 */
  excluded: number
  errors: { scheduleId: string; message: string }[]
  /** true 表示這次呼叫時已經有另一次執行在進行中，本次沒有真的跑。 */
  alreadyRunning: boolean
}
// ── 負載分析（GET /api/analytics/workload）──────────────────
export type WorkloadLevel = '超載' | '滿載' | '中等' | '偏低'

export interface WorkloadEngineer {
  testEngineer: string
  testUnits: string[]
  scheduleCount: number
  baseScore: number
  rate: number // %
  level: WorkloadLevel
  unscheduledDays: number
  partialDays: number
  cappedDays: number
}

export interface WorkloadResponse {
  from: string // YYYY-MM
  to: string   // YYYY-MM
  workdays: number
  notes: string[]
  engineers: WorkloadEngineer[]
}
