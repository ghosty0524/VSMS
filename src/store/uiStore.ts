// src/store/uiStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { View } from '../types'

type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices'

interface UIState {
  view: View
  showAddModal: boolean
  ganttCollapsed: boolean
  filterCollapsed: boolean
  settingsTab: SettingsTab
  setView: (v: View) => void
  setShowAddModal: (v: boolean) => void
  setGanttCollapsed: (v: boolean) => void
  setFilterCollapsed: (v: boolean) => void
  setSettingsTab: (v: SettingsTab) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'main',
      showAddModal: false,
      ganttCollapsed: false,
      filterCollapsed: true,
      settingsTab: 'categories',
      setView: (v) => set({ view: v }),
      setShowAddModal: (v) => set({ showAddModal: v }),
      setGanttCollapsed: (v) => set({ ganttCollapsed: v }),
      setFilterCollapsed: (v) => set({ filterCollapsed: v }),
      setSettingsTab: (v) => set({ settingsTab: v }),
    }),
    {
      name: 'vsms-ui-state',
      // ✅ 持久化 view、收合狀態、settingsTab，不持久化 Modal
      partialize: (state) => ({
        view: state.view,
        ganttCollapsed: state.ganttCollapsed,
        filterCollapsed: state.filterCollapsed,
        settingsTab: state.settingsTab,
      }),
    }
  )
)