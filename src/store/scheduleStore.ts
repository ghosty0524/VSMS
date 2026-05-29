import { create } from 'zustand'
import { api } from '../lib/api'
import { useAuthStore } from './authStore'     // ★ 新增
import { useAuditStore } from './auditStore'   // ★ 新增
import type { Schedule } from '../types'

// ★ 新增：取得當前操作人員名稱
function getOperator(): string {
  const { displayName, username } = useAuthStore.getState()
  return displayName || username || 'unknown'
}

interface ScheduleState {
  schedules: Schedule[]
  init: () => Promise<void>
  add: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<void>
  update: (id: string, data: Partial<Schedule>) => Promise<void>
  remove: (id: string) => Promise<void>
  replaceAll: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]) => Promise<void>
}

export const useScheduleStore = create<ScheduleState>()((set, get) => ({
  schedules: [],

  init: async () => {
    const schedules = await api.getSchedules()
    set({ schedules })
  },

  add: async (data) => {
    const schedule = await api.createSchedule(data)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
    // ★ 審計：新增排程
    useAuditStore.getState().addLog({
      operator: getOperator(),
      action: 'CREATE',
      field: `新增排程「${schedule.projectName}」`,
    })
  },

  update: async (id, data) => {
    const updated = await api.updateSchedule(id, data)
    set((s) => ({ schedules: s.schedules.map((x) => x.id === id ? updated : x) }))
    // ★ 審計：更新排程
    useAuditStore.getState().addLog({
      operator: getOperator(),
      action: 'UPDATE',
      field: `更新排程「${updated.projectName}」`,
    })
  },

  remove: async (id) => {
    // ★ 先取得排程名稱（刪除後就拿不到了）
    const target = get().schedules.find((x) => x.id === id)
    await api.deleteSchedule(id)
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }))
    // ★ 審計：刪除排程
    useAuditStore.getState().addLog({
      operator: getOperator(),
      action: 'DELETE',
      field: `刪除排程「${target?.projectName || id}」`,
    })
  },

  replaceAll: async (data) => {
    const schedules = await api.replaceAllSchedules(data)
    set({ schedules })
    // ★ 審計：Excel 匯入
    useAuditStore.getState().addLog({
      operator: getOperator(),
      action: 'CREATE',
      field: `Excel 匯入覆蓋，共 ${schedules.length} 筆排程`,
    })
  },
}))