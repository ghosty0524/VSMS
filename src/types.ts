// src/types.ts
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
  specificDates: string[]  // YYYY/MM/DD
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
  displayName: string      // 選填，預設等於 username
  passwordHash: string     // SHA-256
  role: 'super_admin' | 'admin' | 'user'
  isActive: boolean
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
  delayReason: string
}