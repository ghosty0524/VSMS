import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import { useUIStore } from './uiStore'
import { useAuditStore } from './auditStore'   // ★ 新增

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
  role: 'super_admin' | 'admin' | 'user' | null
  username: string
  displayName: string
  allowedUnits: string[]
  linkedEngineer: string
  loginError: string
  loginWarning: string
  accounts: Account[]
  checkAuth: () => Promise<void>
  login: (username: string, password: string, force?: boolean) => Promise<void>
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
  loginError: '',
  loginWarning: '',
  accounts: [],

  checkAuth: async () => {
    try {
      const res = await api.me()
      set({
        isLoggedIn: true,
        isChecking: false,
        role: res.role as 'super_admin' | 'admin' | 'user',
        username: res.username,
        displayName: res.displayName,
        allowedUnits: res.allowedUnits ?? [],
        linkedEngineer: res.linkedEngineer ?? '',
      })
    } catch {
      set({ isLoggedIn: false, isChecking: false })
    }
  },

  login: async (username, password, force) => {
    try {
      const result = await api.login(username, password, force)

      if (result.firstRun) {
        const me = await api.me()
        set({
          isLoggedIn: true,
          isFirstRun: false,
          loginError: '',
          loginWarning: '',
          role: me.role as 'super_admin' | 'admin' | 'user',
          username: me.username,
          displayName: me.displayName,
          allowedUnits: me.allowedUnits ?? [],
          linkedEngineer: me.linkedEngineer ?? '',
        })
        // ★ 審計：首次啟動登入
        useAuditStore.getState().addLog({
          operator: me.displayName || me.username,
          action: 'LOGIN',
          field: '首次啟動登入',
        })
        return
      }

      if (result.warning === 'duplicate_session') {
        set({
          loginWarning:
            '目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。',
        })
        return
      }

      const me = await api.me()
      set({
        isLoggedIn: true,
        loginError: '',
        loginWarning: '',
        role: me.role as 'super_admin' | 'admin' | 'user',
        username: me.username,
        displayName: me.displayName,
        allowedUnits: me.allowedUnits ?? [],
        linkedEngineer: me.linkedEngineer ?? '',
      })
      // ★ 審計：一般登入
      useAuditStore.getState().addLog({
        operator: me.displayName || me.username,
        action: 'LOGIN',
        field: force ? '強制登入（踢除既有 session）' : '登入系統',
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          set({ loginError: '帳號或密碼錯誤，請重新輸入。' })
        } else if (err.status === 403) {
          set({ loginError: '目前已達登入人數上限（30 人），請稍後再試。' })
        } else {
          set({ loginError: '無法連接伺服器，請確認伺服器已啟動。' })
        }
      } else {
        set({ loginError: '無法連接伺服器，請確認伺服器已啟動。' })
      }
    }
  },

  logout: () => {
    // ★ 審計：登出（必須在清除 state 之前寫入）
    const { displayName, username } = get()
    useAuditStore.getState().addLog({
      operator: displayName || username || 'unknown',
      action: 'LOGOUT',
      field: '登出系統',
    })

    api.logout().catch(console.error)
    sessionStorage.removeItem('ganttLeftWidth')
    useUIStore.getState().setView('main')
    set({
      isLoggedIn: false,
      role: null,
      username: '',
      displayName: '',
      allowedUnits: [],
      linkedEngineer: '',
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