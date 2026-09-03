// src/store/toastStore.ts
// 全站唯一的通知佇列。
//
// 在此之前系統有三套各自獨立的通知：Header 自己的 toast 陣列、GanttChart 的
// saveNotice、GanttChart 的 copyNotice。三者都是 `fixed right-4`，前兩者甚至都在
// `top-4`，同時出現就會疊在一起互相遮蔽。改成單一佇列後它們會依序往下堆。
//
// 保留 2026-07-09 的既有設計決定：error 與 loading 不自動消失，必須由使用者
// 關閉或由程式收掉，避免錯誤訊息在人還沒看到之前就消失。
import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info' | 'loading'

export interface Toast {
  id: number
  text: string
  kind: ToastKind
}

const DEFAULT_DURATION_MS = 4000

// Date.now() 在同一毫秒內連續推兩則會撞號，用遞增計數器當 id。
let nextId = 1

interface ToastState {
  toasts: Toast[]
  /** 推一則通知，回傳 id 供之後主動關閉（例如 loading 換成結果）。 */
  push: (text: string, kind?: ToastKind, durationMs?: number) => number
  dismiss: (id: number) => void
  clear: () => void
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (text, kind = 'info', durationMs = DEFAULT_DURATION_MS) => {
    const id = nextId++
    set(s => ({ toasts: [...s.toasts, { id, text, kind }] }))
    if (kind !== 'error' && kind !== 'loading') {
      setTimeout(() => get().dismiss(id), durationMs)
    }
    return id
  },

  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}))

/** 供非元件程式碼（store、lib）推通知，不必先取得 hook。 */
export const toast = {
  success: (text: string, durationMs?: number) => useToastStore.getState().push(text, 'success', durationMs),
  error:   (text: string) => useToastStore.getState().push(text, 'error'),
  info:    (text: string, durationMs?: number) => useToastStore.getState().push(text, 'info', durationMs),
  loading: (text: string) => useToastStore.getState().push(text, 'loading'),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
}
