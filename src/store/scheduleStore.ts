import { create } from 'zustand'
import { api } from '../lib/api'
import type { Schedule } from '../types'

interface ScheduleState {
  schedules: Schedule[]
  init: () => Promise<void>
  add: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<void>
  update: (id: string, data: Partial<Schedule>) => Promise<void>
  remove: (id: string) => Promise<void>
  replaceAll: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]) => Promise<void>
}

// 審計紀錄由後端在各 API 內寫入（appendAudit），前端不再另行記錄

export const useScheduleStore = create<ScheduleState>()((set) => ({
  schedules: [],

  init: async () => {
    const schedules = await api.getSchedules()
    set({ schedules })
  },

  add: async (data) => {
    const schedule = await api.createSchedule(data)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
  },

  update: async (id, data) => {
    const updated = await api.updateSchedule(id, data)
    set((s) => ({ schedules: s.schedules.map((x) => x.id === id ? updated : x) }))
  },

  remove: async (id) => {
    await api.deleteSchedule(id)
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }))
  },

  replaceAll: async (data) => {
    const schedules = await api.replaceAllSchedules(data)
    set({ schedules })
  },
}))
