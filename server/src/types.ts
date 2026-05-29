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
}

export interface Option {
  id: string
  value: string
  label: string
  isActive: boolean
  sortOrder: number
}

export interface TestUnitOption extends Option {
  engineers: Option[]
}

export interface RestDaysConfig {
  weekends: boolean
  specificDates: string[]
}

export interface OptionsMap {
  categories: Option[]
  testUnits: TestUnitOption[]
  restDays: RestDaysConfig
  devices: Option[]
}

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