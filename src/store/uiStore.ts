// src/store/uiStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { View } from '../types'

type SettingsTab = 'categories' | 'units' | 'people' | 'restdays' | 'devices' | 'notify'

interface UIState {
  view: View
  showAddModal: boolean
  filterCollapsed: boolean
  settingsTab: SettingsTab
  /** 人員頁「已停用」區塊是否展開；預設摺疊，避免名單愈來愈長 */
  peopleInactiveOpen: boolean
  setView: (v: View) => void
  setShowAddModal: (v: boolean) => void
  setFilterCollapsed: (v: boolean) => void
  setSettingsTab: (v: SettingsTab) => void
  setPeopleInactiveOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'main',
      showAddModal: false,
      filterCollapsed: true,
      settingsTab: 'categories',
      peopleInactiveOpen: false,
      setView: (v) => set({ view: v }),
      setShowAddModal: (v) => set({ showAddModal: v }),
      setFilterCollapsed: (v) => set({ filterCollapsed: v }),
      setSettingsTab: (v) => set({ settingsTab: v }),
      setPeopleInactiveOpen: (v) => set({ peopleInactiveOpen: v }),
    }),
    {
      name: 'vsms-ui-state',
      // ✅ 持久化 view、收合狀態、settingsTab，不持久化 Modal
      partialize: (state) => ({
        view: state.view,
        filterCollapsed: state.filterCollapsed,
        settingsTab: state.settingsTab,
        peopleInactiveOpen: state.peopleInactiveOpen,
      }),
    }
  )
)