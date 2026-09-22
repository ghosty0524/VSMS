// src/components/layout/Header.tsx
//
// 單排標題列。改版前是兩排（上排 logo + 四顆排程操作按鈕 + 使用者，下排導覽分頁），
// 共約 103px。排程操作按鈕全部只跟排程資料有關，放在全域標題列會造成
// 「切到統計頁時新增排程消失、但匯入還在」這種位置不穩定的觀感，已搬到
// 主畫面的 ScheduleToolbar。標題列只剩導覽與身分，收成一排 48px。
import {
  LayoutList, BarChart2, Settings, ClipboardList, LogOut,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import type { Role, View } from '../../types'

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

const NAV_TABS: {
  key: View
  label: string
  icon: React.ReactNode
  superAdminOnly?: boolean
  userHidden?: boolean
}[] = [
  { key: 'main',      label: '排程管理',   icon: <LayoutList    size={15} /> },
  { key: 'analytics', label: '統計分析',   icon: <BarChart2     size={15} />, userHidden: true },
  { key: 'settings',  label: '系統設定',   icon: <Settings      size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄',   icon: <ClipboardList size={15} />, superAdminOnly: true },
]

export function Header({ currentView, onNavigate, role }: Props) {
  const { logout, displayName } = useAuthStore()
  const authProvider = useAuthStore(s => s.authProvider)

  const visibleTabs = NAV_TABS.filter(tab => {
    if (tab.superAdminOnly && role !== 'super_admin') return false
    if (tab.userHidden && (role === 'user' || role === 'guest')) return false
    return true
  })

  return (
    <header className="bg-slate-800 shadow-md flex-shrink-0">
      <div className="h-12 px-4 flex items-center gap-4 whitespace-nowrap">

        {/* Logo */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-md flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2
                   0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2
                   2 0 012 2" />
            </svg>
          </div>
          <span className="text-sm font-bold text-white tracking-wide">VSMS</span>
        </div>

        {/* 導覽。只有一個項目時（user 與 guest）不顯示，免得留一排點不出東西的分頁 */}
        {visibleTabs.length > 1 && (
          <nav aria-label="主導覽" className="flex items-center gap-0.5 h-full overflow-x-auto">
            {visibleTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                aria-current={currentView === tab.key ? 'page' : undefined}
                onClick={() => onNavigate(tab.key)}
                className={`flex flex-shrink-0 items-center gap-1.5 px-3 h-full text-sm font-medium
                            border-b-2 transition-colors
                            ${currentView === tab.key
                              ? 'border-blue-400 text-white'
                              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {/* 使用者資訊 + 登出 */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <span className="text-sm text-slate-200 font-medium hidden sm:block">
            {displayName}
          </span>
          {/* 角色徽章：改版前是實色底加白字（purple-500 / green-500 / amber-500），
              對比只有 2.15～3.94:1，全部不到 AA 的 4.5:1。改為淡底深字後拉到 7:1 以上，
              在深色標題列上也更安靜。三顆都補了 title。 */}
          {role === 'super_admin' && (
            <span title="超級管理者"
                  className="px-1.5 py-0.5 text-xs font-bold
                             bg-purple-100 text-purple-800 rounded-md leading-tight">
              SA
            </span>
          )}
          {role === 'admin' && (
            <span title="管理者"
                  className="px-1.5 py-0.5 text-xs font-bold
                             bg-sky-100 text-sky-800 rounded-md leading-tight">
              A
            </span>
          )}
          {role === 'user' && (
            <span title="測試人員"
                  className="px-1.5 py-0.5 text-xs font-bold
                             bg-emerald-100 text-emerald-800 rounded-md leading-tight">
              U
            </span>
          )}
          {role === 'guest' && (
            <span title="訪客（唯讀）"
                  className="px-1.5 py-0.5 text-xs font-bold
                             bg-amber-100 text-amber-800 rounded-md leading-tight">
              G
            </span>
          )}
          {authProvider === 'vauth' && role !== 'guest' && (
            <a
              href="/#change-password"
              title="密碼由入口頁統一管理"
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm
                         text-slate-400 hover:text-white hover:bg-slate-700
                         rounded-md transition-colors"
            >
              <span className="hidden sm:block">修改密碼</span>
              <span className="sm:hidden">密碼</span>
            </a>
          )}
          <a
            href="/"
            title="回到入口頁選擇其他系統"
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm
                       text-slate-400 hover:text-white hover:bg-slate-700
                       rounded-md transition-colors"
          >
            <span className="hidden sm:block">回入口頁</span>
            <span className="sm:hidden">入口</span>
          </a>
          <button
            type="button"
            onClick={logout}
            title="登出"
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm
                       text-slate-400 hover:text-white hover:bg-slate-700
                       rounded-md transition-colors"
          >
            <LogOut size={14} />
            <span className="hidden sm:block">登出</span>
          </button>
        </div>
      </div>
    </header>
  )
}
