// src/components/layout/Sidebar.tsx
//
// VSMS 的左側欄（UI 統一 4C），取代 4A 放在頂欄下方的 40px 導覽分頁列。三系統各自實作、
// 行為一致，規格：F:\vportal\docs\superpowers\specs\2026-09-24-sidebar-design.md
//
// - 分組：「排程」（排程管理、統計分析）、「系統」（系統設定、審計紀錄）。角色篩選沿用 4A：
//   superAdminOnly 只給 super_admin；userHidden 對 user、guest 隱藏。篩選後沒有項目的組整組拿掉。
// - 可見項目只有一個（user、guest）時整個側欄（連同抽屜；頂欄的「選單」鈕也看同一個判斷）
//   不渲染，內容區佔滿寬度。
// - ≥ md：桌面側欄，展開 232px、收合 56px；寬度 150ms 過場，只在允許動畫時（motion-safe:）。
//   收合狀態記在 localStorage 的 vsms-nav-collapsed（'1' 收合、'0' 展開），讀不到一律展開、
//   寫入失敗不報錯。
// - < md：桌面側欄隱藏，改成頂欄「選單」鈕打開的抽屜（232px、一律展開樣式、沒有收合鈕）。
//   開關狀態在 navDrawerStore。抽屜一直掛著、關閉時 aria-hidden＋inert，讓「選單」鈕的
//   aria-controls 永遠指得到。遮罩 z-[45]、面板 z-[46]：高於頁面內容（最高 z-40）與頂欄，低於對話框（z-50）；
//   甘特圖全螢幕是 z-[100]，照樣蓋住側欄與抽屜。
//   打開時焦點到第一個項目、Tab 在抽屜內循環；點遮罩、Esc、點項目、視窗放大到 ≥ md 都會關閉，
//   關閉後焦點回「選單」鈕（視窗放大那種除外：鈕已隱藏）。只有打開時滑入；關閉是立即隱藏（visibility 不做過場，
//   打開當下才能馬上把焦點放進去）。
// - 選取色是 VSMS 的青綠（--vw-accent／--vw-accent-subtle）。
//
// 甘特圖不用跟著改：它的 SVG 寬是「天數 × 22px」、外層是橫向捲動容器，寬度全由 CSS 決定，
// 側欄收合時內容區變寬、可視範圍自動變大；統計頁的 recharts ResponsiveContainer 自己用
// ResizeObserver 重畫。App 的內容區要 min-w-0，甘特圖才不會把 flex 列撐開。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  LayoutList, BarChart2, Settings, ClipboardList, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavDrawerStore } from '../../store/navDrawerStore'
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

/** 可見項目超過一個才有側欄（只有一頁可看的角色不顯示）。頂欄「選單」鈕也用這個判斷。 */
export function sidebarVisible(role: Role | null): boolean {
  return visibleNavGroups(role).reduce((n, g) => n + g.items.length, 0) > 1
}

export const SIDEBAR_ID = 'app-sidebar'
export const NAV_DRAWER_ID = 'app-nav-drawer'
export const NAV_MENU_BUTTON_ID = 'vsms-nav-menu-button'
export const NAV_COLLAPSED_KEY = 'vsms-nav-collapsed'
/** Tailwind 的 md 斷點（48rem＝768px）。視窗放大到這個寬度就關閉抽屜。 */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

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
  const drawerOpen = useNavDrawerStore(s => s.open)
  const setDrawerOpen = useNavDrawerStore(s => s.setOpen)
  const drawerRef = useRef<HTMLDivElement>(null)

  // 關閉後焦點回「選單」鈕（在頂欄 Topbar，用 id 找）。視窗放大到 ≥ md 時那顆鈕已隱藏，
  // 傳 false 略過。
  const closeDrawer = useCallback((returnFocus: boolean = true) => {
    setDrawerOpen(false)
    if (returnFocus) document.getElementById(NAV_MENU_BUTTON_ID)?.focus()
  }, [setDrawerOpen])

  // 打開時焦點到第一個項目。
  useEffect(() => {
    if (drawerOpen) drawerRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [drawerOpen])

  // Esc 關閉。掛在 document 並 stopPropagation：甘特圖的覆蓋式全螢幕在 window 上聽 Esc。
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  // 視窗放大到 ≥ md 時關閉（桌面側欄接手）。
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) closeDrawer(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [drawerOpen, closeDrawer])

  // 卸載（登出、角色變成沒有側欄）時歸零，下次掛載不會自己開著。
  useEffect(() => () => { useNavDrawerStore.getState().setOpen(false) }, [])

  if (!sidebarVisible(role)) return null
  const groups = visibleNavGroups(role)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    writeNavCollapsed(next)
  }

  const selectFromDrawer = (v: View) => {
    onNavigate(v)
    closeDrawer()
  }

  // Tab 在抽屜內循環：抽屜裡可聚焦的只有項目按鈕（面板本身 tabIndex=-1，不在 Tab 順序裡）。
  const onDrawerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    // 焦點停在面板本身（點到空白處）時，Shift+Tab 也要繞回最後一項，不能跑出抽屜。
    if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <aside
        id={SIDEBAR_ID}
        className={`hidden md:flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
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

      <div className="md:hidden">
        <div
          data-testid="nav-drawer-scrim"
          aria-hidden="true"
          onClick={() => closeDrawer()}
          className={`fixed inset-0 z-[45] bg-[rgba(23,33,46,0.4)] motion-safe:transition-opacity duration-150
                      ${drawerOpen ? 'opacity-100' : 'invisible opacity-0'}`}
        />
        <div
          ref={drawerRef}
          id={NAV_DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label="主選單"
          aria-hidden={drawerOpen ? undefined : true}
          inert={!drawerOpen}
          // 可聚焦但不在 Tab 順序裡：點到面板空白處時焦點停在面板上（不掉到 body、跑出抽屜），
          // Tab 循環仍由 onDrawerKeyDown 接手。與入口頁的 NavDrawer 一致。
          tabIndex={-1}
          onKeyDown={onDrawerKeyDown}
          className={`fixed inset-y-0 left-0 z-[46] flex w-[232px] flex-col bg-[var(--vw-surface)] focus:outline-none
                      border-r border-[var(--vw-border)] shadow-lg motion-safe:transition-transform duration-150
                      ${drawerOpen ? 'translate-x-0' : 'invisible -translate-x-full'}`}
        >
          <nav aria-label="主選單" className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
            <NavGroups groups={groups} currentView={currentView} collapsed={false} onSelect={selectFromDrawer} />
          </nav>
        </div>
      </div>
    </>
  )
}
