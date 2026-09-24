// src/components/layout/Sidebar.tsx
//
// VSMS 的左側欄（UI 統一 4C），取代 4A 放在頂欄下方的 40px 導覽分頁列。三系統各自實作、
// 行為一致，規格：F:\vportal\docs\superpowers\specs\2026-09-24-sidebar-design.md
//
// - 分組：「排程」（排程管理、統計分析）、「系統」（系統設定、審計紀錄）。角色篩選沿用 4A：
//   superAdminOnly 只給 super_admin；userHidden 對 user、guest 隱藏。篩選後沒有項目的組整組拿掉。
// - 可見項目只有一個（user、guest）時整個側欄不渲染，內容區佔滿寬度。
// - 展開 232px、收合 56px；寬度 150ms 過場，只在允許動畫時（motion-safe:）。收合狀態記在
//   localStorage 的 vsms-nav-collapsed（'1' 收合、'0' 展開），讀不到一律展開、寫入失敗不報錯。
// - 選取色是 VSMS 的青綠（--vw-accent／--vw-accent-subtle）。
//
// 甘特圖不用跟著改：它的 SVG 寬是「天數 × 22px」、外層是橫向捲動容器，寬度全由 CSS 決定，
// 側欄收合時內容區變寬、可視範圍自動變大；統計頁的 recharts ResponsiveContainer 自己用
// ResizeObserver 重畫。App 的內容區要 min-w-0，甘特圖才不會把 flex 列撐開。
import { useState } from 'react'
import {
  LayoutList, BarChart2, Settings, ClipboardList, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role, View } from '../../types'

export interface NavItem {
  key: View
  label: string
  icon: LucideIcon
  superAdminOnly?: boolean
  userHidden?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '排程',
    items: [
      { key: 'main',      label: '排程管理', icon: LayoutList },
      { key: 'analytics', label: '統計分析', icon: BarChart2, userHidden: true },
    ],
  },
  {
    title: '系統',
    items: [
      { key: 'settings', label: '系統設定', icon: Settings, userHidden: true },
      { key: 'audit',    label: '審計紀錄', icon: ClipboardList, superAdminOnly: true },
    ],
  },
]

function itemVisible(item: NavItem, role: Role | null): boolean {
  if (item.superAdminOnly && role !== 'super_admin') return false
  if (item.userHidden && (role === 'user' || role === 'guest')) return false
  return true
}

/** 依角色篩掉看不到的項目，再拿掉沒有項目的組。 */
export function visibleNavGroups(role: Role | null): NavGroup[] {
  return NAV_GROUPS
    .map(g => ({ title: g.title, items: g.items.filter(i => itemVisible(i, role)) }))
    .filter(g => g.items.length > 0)
}

/** 可見項目超過一個才有側欄（只有一頁可看的角色不顯示）。 */
export function sidebarVisible(role: Role | null): boolean {
  return visibleNavGroups(role).reduce((n, g) => n + g.items.length, 0) > 1
}

export const SIDEBAR_ID = 'app-sidebar'
export const NAV_COLLAPSED_KEY = 'vsms-nav-collapsed'

/** 讀不到（無痕、被封鎖、值不是 '1'）一律視為展開。 */
export function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** 寫入失敗（無痕、被封鎖、容量滿）不報錯，只是下次不記得。 */
export function writeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 刻意忽略
  }
}

const ITEM_BASE =
  'flex h-9 w-full items-center gap-2.5 rounded-[var(--vw-radius-control)] text-[13px] font-medium whitespace-nowrap transition-colors'
const ITEM_IDLE =
  'text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'
const ITEM_CURRENT = 'bg-[var(--vw-accent-subtle)] text-[var(--vw-accent)]'

interface NavGroupsProps {
  groups: NavGroup[]
  currentView: View
  collapsed: boolean
  onSelect: (v: View) => void
}

function NavGroups({ groups, currentView, collapsed, onSelect }: NavGroupsProps) {
  return (
    <div className={`flex flex-col ${collapsed ? '' : 'gap-4'}`}>
      {groups.map(group => (
        <div key={group.title} role="group" aria-label={group.title}>
          {collapsed
            ? (
              <div
                data-testid="nav-group-divider"
                aria-hidden="true"
                className="mx-auto my-2 h-px w-6 bg-[var(--vw-border)]"
              />
            )
            : (
              <div
                aria-hidden="true"
                className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[var(--vw-text-muted)]"
              >
                {group.title}
              </div>
            )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(item => {
              const current = item.key === currentView
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-current={current ? 'page' : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    onClick={() => onSelect(item.key)}
                    className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${current ? ITEM_CURRENT : ITEM_IDLE}`}
                  >
                    <Icon size={18} aria-hidden="true" className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

export function Sidebar({ currentView, onNavigate, role }: Props) {
  const [collapsed, setCollapsed] = useState(readNavCollapsed)

  if (!sidebarVisible(role)) return null
  const groups = visibleNavGroups(role)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    writeNavCollapsed(next)
  }

  return (
    <aside
      id={SIDEBAR_ID}
      className={`flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
                  motion-safe:transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-[232px]'}`}
    >
      <nav aria-label="主選單" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-3">
        <NavGroups groups={groups} currentView={currentView} collapsed={collapsed} onSelect={onNavigate} />
      </nav>
      <div className="flex-shrink-0 px-2 py-2 border-t border-[var(--vw-border)]">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '展開側欄' : '收合側欄'}
          aria-expanded={!collapsed}
          aria-controls={SIDEBAR_ID}
          title={collapsed ? '展開側欄' : undefined}
          className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${ITEM_IDLE}`}
        >
          {collapsed
            ? <PanelLeftOpen size={18} aria-hidden="true" className="flex-shrink-0" />
            : <PanelLeftClose size={18} aria-hidden="true" className="flex-shrink-0" />}
          {!collapsed && <span>收合側欄</span>}
        </button>
      </div>
    </aside>
  )
}
