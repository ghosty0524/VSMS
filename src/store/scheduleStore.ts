import { create } from 'zustand'
import { api } from '../lib/api'
import type { Schedule, ScheduleCreateInput } from '../types'

interface ScheduleState {
  schedules: Schedule[]
  init: () => Promise<void>
  add: (data: ScheduleCreateInput) => Promise<Schedule>
  update: (id: string, data: Partial<Schedule>) => Promise<Schedule>
  remove: (id: string) => Promise<void>
  replaceAll: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]) => Promise<void>
  /** 用後端回來的整筆取代清單中同 id 的那筆（例如 vtms-link 之後） */
  replaceInStore: (schedule: Schedule) => void
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
    return schedule
  },

  update: async (id, data) => {
    const updated = await api.updateSchedule(id, data)
    set((s) => ({ schedules: s.schedules.map((x) => x.id === id ? updated : x) }))
    return updated
  },

  replaceInStore: (schedule) => {
    set((s) => ({ schedules: s.schedules.map((x) => x.id === schedule.id ? schedule : x) }))
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
