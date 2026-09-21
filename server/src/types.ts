// server/src/types.ts

export interface Schedule {
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
  completedAt: string | null
  delayReason: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  adminFlag:     boolean
  adminFlagNote: string
  userFlag:      boolean
  userFlagNote:  string
  device:        string
  vtmsPlanId:    string | null
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
  /** 所屬部門；null = 自成一部；undefined = 呼叫端沒表態（PUT 時保留舊值） */
  department?: string | null
  engineers: EngineerOption[]
}

export interface RestDaysConfig {
  weekends: boolean
  specificDates: string[]
}

export interface OptionsMap {
  categories: CategoryOption[]
  testUnits: TestUnitOption[]
  restDays: RestDaysConfig
  devices: Option[]
}

// Session-level role. 'guest' is a virtual account (never stored in the users
// table) with read-only access enforced by the guestReadOnly middleware.
export type Role = 'super_admin' | 'admin' | 'user' | 'guest'

export interface User {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'super_admin' | 'admin' | 'user'
  isActive: boolean
  // ✅ 新增：管轄測試單位（空陣列 = 無限制，僅 super_admin 預設如此）
  allowedUnits: string[]
  linkedEngineer: string
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
  createdAt: string
  lastLoginAt: string
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