import type {
  Schedule, OptionsMap, Option, User, AuditLog, VtmsProgress,
  NotifyConfig, NotifyRule, NotifyLog, NotifyPreview, NotifyRunResult,
} from '../types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** 後端驗證(422)回傳的逐欄位錯誤,例如 { taskDescription: '任務描述不可超過 500 字' } */
    public readonly fieldErrors?: Record<string, string>,
    /** 後端機器可讀錯誤代碼，例如 'ENGINEER_IN_USE'（並非所有錯誤回應都有） */
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 最後一次 API 活動時間（供 session 逾時提醒判斷閒置時長）
let lastApiActivityAt = Date.now()
export function getLastApiActivityAt(): number {
  return lastApiActivityAt
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = sessionStorage.getItem('vsms-session-token')
  if (token) headers['X-Vsms-Session'] = token

  lastApiActivityAt = Date.now()
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string; errors?: Record<string, string>; code?: string }
    const fieldErrors = res.status === 422 && data.errors && typeof data.errors === 'object' ? data.errors : undefined
    throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`, fieldErrors, data.code)
  }
  return res.json() as Promise<T>
}

export const api = {
  // ── Auth ──────────────────────────────────────────────
  login: (username: string, password: string, force?: boolean) =>
    req<{
      ok: boolean
      warning?: string
      firstRun?: boolean
      sessionId?: string
      username?: string
      displayName?: string
      role?: string
      allowedUnits?: string[]
      linkedEngineer?: string
      canLinkVtms?: boolean
      canViewVtmsProgress?: boolean
    }>('POST', '/login', { username, password, force }),
  guestLogin: () =>
    req<{
      ok: boolean
      sessionId?: string
      username?: string
      displayName?: string
      role?: string
    }>('POST', '/guest-login'),
  logout: () =>
    req<{ ok: boolean }>('POST', '/logout'),
  me: () =>
    req<{ ok: boolean; role: string; username: string; displayName: string; allowedUnits?: string[]; linkedEngineer?: string; canLinkVtms?: boolean; canViewVtmsProgress?: boolean; sessionTimeoutMin?: number }>('GET', '/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('POST', '/change-password', { oldPassword, newPassword }),

  // ── Schedules ─────────────────────────────────────────
  getSchedules: () =>
    req<Schedule[]>('GET', '/schedules'),
  createSchedule: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) =>
    req<Schedule>('POST', '/schedules', data),
  updateSchedule: (id: string, data: Partial<Schedule>) =>
    req<Schedule>('PUT', `/schedules/${id}`, data),
  deleteSchedule: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/schedules/${id}`),
  replaceAllSchedules: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]) =>
    req<Schedule[]>('PUT', '/schedules/replace-all', data),

  // ── Options ───────────────────────────────────────────
  getOptions: () =>
    req<OptionsMap>('GET', '/options'),
  updateOptions: (options: OptionsMap) =>
    req<OptionsMap>('PUT', '/options', options),

  // ── Users（Super Admin only）──────────────────────────
  getUsers: () =>
    req<Omit<User, 'passwordHash'>[]>('GET', '/users'),
  createUser: (data: { username: string; displayName?: string; password: string; allowedUnits?: string[]; role?: 'admin' | 'user'; linkedEngineer?: string }) =>
    req<Omit<User, 'passwordHash'>>('POST', '/users', data),
  updateUser: (id: string, data: { displayName?: string; password?: string; isActive?: boolean; allowedUnits?: string[]; linkedEngineer?: string; canLinkVtms?: boolean; canViewVtmsProgress?: boolean }) =>
    req<Omit<User, 'passwordHash'>>('PUT', `/users/${id}`, data),
  disableUser: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/users/${id}`),
  enableUser: (id: string) =>
    req<Omit<User, 'passwordHash'>>('PUT', `/users/${id}`, { isActive: true }),
  deleteUserPermanent: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/users/${id}/permanent`),

  // ── Audit（Super Admin only）──────────────────────────
  getAudit: (params?: { from?: string; to?: string; username?: string; action?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined)
          ) as Record<string, string>
        ).toString()
      : ''
    return req<AuditLog[]>('GET', `/audit${qs}`)
  },

  // ── Devices ───────────────────────────────────────────
  createDevice: (data: { value: string; label: string; sortOrder: number }) =>
    req<Option>('POST', '/options/devices', data),
  updateDevice: (id: string, data: { label?: string; isActive?: boolean; sortOrder?: number }) =>
    req<Option>('PUT', `/options/devices/${id}`, data),
  deleteDevice: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/options/devices/${id}`),

  // ── VTMS progress ─────────────────────────────────────
  getScheduleVtmsProgress: (scheduleId: string) =>
    req<VtmsProgress>('GET', `/schedules/${scheduleId}/vtms-progress`),

  // ── Notify ────────────────────────────────────────────
  notifyConfig: () =>
    req<NotifyConfig>('GET', '/notify/config'),
  updateNotifyConfig: (patch: Partial<Omit<NotifyConfig, 'smtpConfigured' | 'fallbackRecipients' | 'templateVars'>>) =>
    req<{ ok: boolean }>('PUT', '/notify/config', patch),
  notifyRules: () =>
    req<{ rules: NotifyRule[]; testUnits: { value: string; label: string }[]; templateVars: string[] }>(
      'GET', '/notify/rules'),
  createNotifyRule: (testUnit: string) =>
    req<{ ok: boolean; rule: NotifyRule }>('POST', '/notify/rules', { testUnit }),
  updateNotifyRule: (id: string, patch: Partial<Omit<NotifyRule, 'id' | 'testUnit'>>) =>
    req<{ ok: boolean }>('PUT', `/notify/rules/${id}`, patch),
  deleteNotifyRule: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/notify/rules/${id}`),
  notifyPreview: (scheduleId: string) =>
    req<NotifyPreview>('POST', '/notify/preview', { scheduleId }),
  notifyLogs: (limit = 200) =>
    req<{ logs: NotifyLog[] }>('GET', `/notify/logs?limit=${limit}`),
  notifyRun: () =>
    req<NotifyRunResult>('POST', '/notify/run'),
  notifyTest: (to: string) =>
    req<{ ok: boolean }>('POST', '/notify/test', { to }),
}