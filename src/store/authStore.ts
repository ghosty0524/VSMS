import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import { useUIStore } from './uiStore'
import type { Role } from '../types'

export interface Account {
  id: string
  username: string
  displayName: string
  role: 'super_admin' | 'admin' | 'user'
  active: boolean
  allowedUnits: string[]
  linkedEngineer: string
}

interface AuthState {
  isLoggedIn: boolean
  isFirstRun: boolean
  isChecking: boolean
  role: Role | null
  username: string
  displayName: string
  allowedUnits: string[]
  linkedEngineer: string
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
  sessionTimeoutMin: number
  loginError: string
  loginWarning: string
  accounts: Account[]
  authProvider: 'local' | 'vauth'
  checkAuth: () => Promise<void>
  login: (username: string, password: string, force?: boolean) => Promise<void>
  guestLogin: () => Promise<void>
  logout: () => void
  clearErrors: () => void
  fetchAccounts: () => Promise<void>
  updateAccount: (id: string, updates: Partial<Account & { password: string }>) => Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isLoggedIn: false,
  isFirstRun: false,
  isChecking: true,
  role: null,
  username: '',
  displayName: '',
  allowedUnits: [],
  linkedEngineer: '',
  canLinkVtms: false,
  canViewVtmsProgress: false,
  sessionTimeoutMin: 30,
  loginError: '',
  loginWarning: '',
  accounts: [],
  authProvider: 'local' as 'local' | 'vauth',

  checkAuth: async () => {
    try {
      const res = await api.me()
      const cfg = await api.config().catch(() => ({ authProvider: 'local' as const }))
      set({
        authProvider: cfg.authProvider,
        isLoggedIn: true,
        isChecking: false,
        role: res.role as Role,
        username: res.username,
        displayName: res.displayName,
        allowedUnits: res.allowedUnits ?? [],
        linkedEngineer: res.linkedEngineer ?? '',
        canLinkVtms: res.canLinkVtms ?? false,
        canViewVtmsProgress: res.canViewVtmsProgress ?? false,
        sessionTimeoutMin: res.sessionTimeoutMin ?? 30,
      })
    } catch {
      set({ isLoggedIn: false, isChecking: false })
    }
  },

  login: async (username, password, force) => {
    try {
      const result = await api.login(username, password, force)

      if (result.warning === 'duplicate_session') {
        set({
          loginWarning:
            '目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。',
        })
        return
      }

      // Login response includes user data directly — no extra /api/me call needed
      if (result.sessionId) sessionStorage.setItem('vsms-session-token', result.sessionId)
      set({
        isLoggedIn: true,
        isFirstRun: false,
        loginError: '',
        loginWarning: '',
        role: result.role as Role,
        username: result.username ?? '',
        displayName: result.displayName ?? '',
        allowedUnits: result.allowedUnits ?? [],
        linkedEngineer: result.linkedEngineer ?? '',
        canLinkVtms: result.canLinkVtms ?? false,
        canViewVtmsProgress: result.canViewVtmsProgress ?? false,
      })
    } catch (err) {
      if (err instanceof ApiError) {
        // 伺服器訊息已在地化（401 帳密錯誤 / 403 人數上限 / 429 次數過多）
        set({ loginError: err.message || '登入失敗，請稍後再試。' })
      } else {
        set({ loginError: '無法連接伺服器，請確認伺服器已啟動。' })
      }
    }
  },

  guestLogin: async () => {
    try {
      const result = await api.guestLogin()
      if (result.sessionId) sessionStorage.setItem('vsms-session-token', result.sessionId)
      set({
        isLoggedIn: true,
        isFirstRun: false,
        loginError: '',
        loginWarning: '',
        role: 'guest',
        username: result.username ?? 'Guest',
        displayName: result.displayName ?? '訪客',
        allowedUnits: [],
        linkedEngineer: '',
        canLinkVtms: false,
        canViewVtmsProgress: false,
      })
    } catch (err) {
      if (err instanceof ApiError) {
        set({ loginError: err.message || '訪客登入失敗，請稍後再試。' })
      } else {
        set({ loginError: '無法連接伺服器，請確認伺服器已啟動。' })
      }
    }
  },

  logout: () => {
    // 登出審計由後端 /api/logout 寫入
    api.logout().catch(console.error)
    // 單一登入模式：系統內登出＝整個平台登出（撤銷入口頁的 SSO），同源、盡力而為。
    if (get().authProvider === 'vauth') {
      fetch('/auth/session/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
    }
    sessionStorage.removeItem('vsms-session-token')
    useUIStore.getState().setView('main')
    set({
      isLoggedIn: false,
      role: null,
      username: '',
      displayName: '',
      allowedUnits: [],
      linkedEngineer: '',
      canLinkVtms: false,
      canViewVtmsProgress: false,
      loginWarning: '',
      accounts: [],
    })
  },

  clearErrors: () => set({ loginError: '', loginWarning: '' }),

  fetchAccounts: async () => {
    try {
      const data = await api.getUsers()
      const accounts: Account[] = data.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        active: u.isActive,
        allowedUnits: u.allowedUnits ?? [],
        linkedEngineer: u.linkedEngineer ?? '',
      }))
      set({ accounts })
    } catch (err) {
      console.error('fetchAccounts failed:', err)
    }
  },

  updateAccount: async (id, updates) => {
    try {
      await api.updateUser(id, {
        displayName: updates.displayName,
        password: updates.password,
        allowedUnits: updates.allowedUnits,
      })
      if (updates.displayName && id === get().username) {
        set({ displayName: updates.displayName })
      }
      await get().fetchAccounts()
    } catch (err) {
      console.error('updateAccount failed:', err)
    }
  },
}))