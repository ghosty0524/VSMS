// src/components/layout/NavTabs.tsx
//
// VSMS 的頁面導覽分頁（排程管理／統計分析／系統設定／審計紀錄）。UI 統一 4A 起從頂欄
// 搬到頂欄下方的第二列（40px，白底、底線）：48px 的頂欄放不下產品切換＋導覽＋右側。
// 角色篩選規則照舊；只有一個可見分頁（user、guest）時整列不顯示，免得留一排點不出
// 東西的分頁。選取樣式與系統設定頁的分頁同一套（底線式，border-blue-600 text-blue-700）。
import type { ReactNode } from 'react'
import { LayoutList, BarChart2, Settings, ClipboardList } from 'lucide-react'
import type { Role, View } from '../../types'

export interface NavTab {
  key: View
  label: string
  icon: ReactNode
  superAdminOnly?: boolean
  userHidden?: boolean
}

export const NAV_TABS: NavTab[] = [
  { key: 'main',      label: '排程管理', icon: <LayoutList    size={15} /> },
  { key: 'analytics', label: '統計分析', icon: <BarChart2     size={15} />, userHidden: true },
  { key: 'settings',  label: '系統設定', icon: <Settings      size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄', icon: <ClipboardList size={15} />, superAdminOnly: true },
]

export function visibleNavTabs(role: Role | null): NavTab[] {
  return NAV_TABS.filter(tab => {
    if (tab.superAdminOnly && role !== 'super_admin') return false
    if (tab.userHidden && (role === 'user' || role === 'guest')) return false
    return true
  })
}

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

export function NavTabs({ currentView, onNavigate, role }: Props) {
  const tabs = visibleNavTabs(role)
  if (tabs.length <= 1) return null

  return (
    <nav
      aria-label="主導覽"
      className="h-10 flex-shrink-0 flex items-stretch gap-1 px-4 overflow-x-auto whitespace-nowrap
                 bg-[var(--vw-surface)] border-b border-[var(--vw-border)]"
    >
      {tabs.map(tab => {
        const current = currentView === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={() => onNavigate(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 px-3 text-sm font-medium
                        border-b-2 transition-colors
                        ${current
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
