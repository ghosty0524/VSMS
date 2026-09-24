// src/store/navDrawerStore.ts
//
// 窄螢幕（< md）側欄抽屜的開關狀態（UI 統一 4C）。開關鈕在頂欄（Topbar），抽屜在側欄
// （Sidebar），兩者在 App 裡是兄弟元件，所以狀態放在 store。不持久化：重新整理一律關閉。
import { create } from 'zustand'

interface NavDrawerState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useNavDrawerStore = create<NavDrawerState>()(set => ({
  open: false,
  setOpen: open => set({ open }),
}))
