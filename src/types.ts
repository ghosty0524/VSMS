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

export interface NotifyConfig {
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
  smtpConfigured: boolean
  fallbackRecipients: { id: string; name: string; note: string; isActive: boolean }[]
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

export interface NotifyLog {
  id: string
  scheduleId: string
  sendDate: string
  status: 'sent' | 'failed' | 'failed_permanent'
  recipients: string
  errorMessage: string | null
  attempts: number
  sentAt: string | null
  createdAt: string
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
  errors: { scheduleId: string; message: string }[]
  /** true 表示這次呼叫時已經有另一次執行在進行中，本次沒有真的跑。 */
  alreadyRunning: boolean
}