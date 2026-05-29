import type { Schedule, OptionsMap, User, AuditLog } from '../types'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string }
    throw new ApiError(res.status, data.message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // ── Auth ──────────────────────────────────────────────
  login: (username: string, password: string, force?: boolean) =>
    req<{ ok: boolean; warning?: string; firstRun?: boolean }>(
      'POST', '/login', { username, password, force }
    ),
  logout: () =>
    req<{ ok: boolean }>('POST', '/logout'),
  me: () =>
    req<{ ok: boolean; role: string; username: string; displayName: string; allowedUnits?: string[]; linkedEngineer?: string }>('GET', '/me'),
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
  updateUser: (id: string, data: { displayName?: string; password?: string; isActive?: boolean; allowedUnits?: string[]; linkedEngineer?: string }) =>
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

  // ── Notify ────────────────────────────────────────────
  sendNotification: (summary: string) =>
    req<{ ok: boolean }>('POST', '/notify', { summary }),
  testTeamsWebhook: (webhookUrl: string) =>
    req<{ ok: boolean }>('POST', '/notify/test', { webhookUrl }),

  // ── Dashboard export ──────────────────────────────────
  exportDashboard: () =>
    req<{ html: string }>('GET', '/export/dashboard'),
}