// src/components/layout/Topbar.tsx
//
// 全域頂欄（UI 統一 4A）。三系統各自實作、行為一致，規格：
// F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md
//
// 由左到右：（< md 且有側欄時）「選單」鈕、產品切換（下拉）、並排連結、彈性空白、通知鈴鐺、使用者選單。
// 原本 Header 的導覽分頁搬到頂欄下方的左側欄（Sidebar，UI 統一 4C）；「回入口頁」由產品切換取代；
// 角色縮寫徽章（SA/A/U/G）改成使用者選單標頭裡的中文角色。
//
// 墨色框架（2026-09-24，規格 F:\vportal\docs\superpowers\specs\2026-09-24-ink-frame-design.md）：
// <header> 掛 .vw-chrome（index.css），框架範圍內 --vw-surface、--vw-ink 等 token 換成框架值；
// 頂欄底色另外用 --vw-chrome-top。這裡的顏色一律直接寫 var(--vw-*)：Tailwind 的 slate-*／blue-*
// 在 :root 就算好了，框架換不掉。刻意不跟框架走的兩個顏色：產品切換的標誌方塊維持 VSMS 識別色
// #0E6B63（--color-accent，index.css @theme），使用者頭像是淺版識別色底配墨色字（#17212E，
// 取 --vw-chrome-top）。下拉清單 portal 到 body、不在框架裡，維持白底，清單標頭照一般 token 上色。
//
// 連到入口頁與其他系統的網址都是站台根目錄的絕對路徑（/、/inbox、/change-password、
// /vtms/），不經 withBase：VSMS 部署在 /vsms/ 底下，加前綴會變成 /vsms/inbox。
import { Bell, Check, KeyRound, LogOut, Menu } from 'lucide-react'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { useAuthStore } from '../../store/authStore'
import { useNavDrawerStore } from '../../store/navDrawerStore'
import { NAV_DRAWER_ID, NAV_MENU_BUTTON_ID, sidebarVisible } from './Sidebar'
import { useTopbarData } from './useTopbarData'
import {
  CURRENT_APP_CODE, FALLBACK_APPS, PORTAL_HOME_LABEL, PORTAL_HOME_URL, INBOX_URL,
  CHANGE_PASSWORD_URL, ROLE_LABELS, avatarInitials, formatUnreadBadge,
} from '../../lib/topbarData'

export function Topbar() {
  const displayName = useAuthStore(s => s.displayName)
  const role = useAuthStore(s => s.role)
  const authProvider = useAuthStore(s => s.authProvider)
  const logout = useAuthStore(s => s.logout)

  const vauth = authProvider === 'vauth'
  const guest = role === 'guest'
  const { apps, unreadCount } = useTopbarData({ vauth, guest })

  // 窄螢幕（< md）打開側欄抽屜的「選單」鈕（UI 統一 4C）。沒有側欄的角色（測試人員、訪客）不顯示。
  const showNavMenu = sidebarVisible(role)
  const drawerOpen = useNavDrawerStore(s => s.open)
  const setDrawerOpen = useNavDrawerStore(s => s.setOpen)

  // 下拉：入口頁首頁固定第一項，接著列出所有啟用中的系統（不看 showInTopbar）。
  // vauth 讀取中（apps 為 null）先用內建清單。
  const switcherItems: MenuItem[] = [
    { key: '__portal-home', label: PORTAL_HOME_LABEL, href: PORTAL_HOME_URL },
    ...(apps ?? FALLBACK_APPS).map(a => ({
      key: a.code,
      label: a.name,
      description: a.description,
      href: a.url,
      current: a.code === CURRENT_APP_CODE,
    })),
  ]
  // 並排連結：只列 showInTopbar 的系統。讀取中不畫，免得內建清單閃一下又被換掉。
  const inlineApps = (apps ?? []).filter(a => a.showInTopbar)

  const badge = formatUnreadBadge(unreadCount)

  const userItems: MenuItem[] = []
  // 修改密碼：單一登入模式一律到入口頁；訪客沒有密碼可改；local 模式維持現狀（沒有入口）。
  if (vauth && !guest) {
    userItems.push({
      key: 'change-password', label: '修改密碼', icon: <KeyRound size={14} />, href: CHANGE_PASSWORD_URL,
    })
  }
  userItems.push({
    key: 'logout',
    label: '登出',
    icon: <LogOut size={14} />,
    // 沿用既有的單一登出流程（authStore.logout），這裡不另外處理。
    onSelect: () => { void logout() },
    // 標頭已有底線；前面沒有項目時不再多畫一條。
    separatorBefore: userItems.length > 0,
  })

  // 顯示在白底的下拉清單裡（portal 到 body，不在框架內），token 是一般值。
  const userHeader = (
    <>
      <div className="text-[13px] font-semibold text-[var(--vw-ink)]">{displayName}</div>
      {role && <div className="text-xs text-[var(--vw-text-muted)]">{ROLE_LABELS[role]}</div>}
    </>
  )

  return (
    <header className="vw-chrome h-12 flex-shrink-0 flex items-center gap-4 px-4 whitespace-nowrap
                       bg-[var(--vw-chrome-top)] border-b border-[var(--vw-border)]">
      {showNavMenu && (
        <button
          id={NAV_MENU_BUTTON_ID}
          type="button"
          aria-label="開啟選單"
          aria-expanded={drawerOpen}
          aria-controls={NAV_DRAWER_ID}
          onClick={() => setDrawerOpen(true)}
          className="md:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
                     text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]
                     transition-colors"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}
      <MenuButton
        label="Validation Workspace"
        ariaLabel="切換系統"
        align="left"
        size="md"
        items={switcherItems}
        // -ml-1.5 把 6px 內距抵掉，讓標誌方塊貼齊頂欄 16px 的左緣，只有切換鈕是第一個元素時才要。
        // 窄螢幕「選單」鈕在它前面時不套，兩者間距維持 gap 的 16px；md 以上選單鈕隱藏，照舊套用。
        // md:-ml-1.5 與 -ml-1.5 都要以完整字面出現在原始碼裡，Tailwind 才產生得出來。
        className={`flex flex-shrink-0 items-center gap-2 h-8 ${showNavMenu ? 'md:-ml-1.5' : '-ml-1.5'} px-1.5 rounded-md
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors`}
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-md
                             bg-[var(--color-accent)] text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="hidden sm:inline text-sm font-bold text-[var(--vw-ink)]">Validation Workspace</span>
          </>
        }
      />

      {inlineApps.length > 0 && (
        <nav aria-label="系統" className="hidden md:flex min-w-0 items-center gap-1 overflow-x-auto">
          {inlineApps.map(a => {
            const current = a.code === CURRENT_APP_CODE
            return (
              <a
                key={a.code}
                href={a.url}
                aria-current={current ? 'page' : undefined}
                className={`flex h-8 flex-shrink-0 items-center px-3 rounded-md text-[13px] font-medium
                            transition-colors
                            ${current
                              ? 'bg-[var(--vw-accent-subtle)] text-[var(--vw-ink)]'
                              : 'text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'}`}
              >
                {a.name}
              </a>
            )
          })}
        </nav>
      )}

      <div className="flex-1" />

      {/* 訪客沒有收件匣（入口頁的訪客連結不帶 SSO 登入），不顯示鈴鐺 */}
      {!guest && (
        <a
          href={INBOX_URL}
          aria-label="通知"
          title="通知"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
                     text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]
                     transition-colors"
        >
          <Bell size={18} />
          {badge && (
            <span
              data-testid="topbar-unread"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full
                         bg-[var(--vw-chrome-badge)] text-white text-[10px] font-bold leading-4 text-center"
            >
              {badge}
            </span>
          )}
        </a>
      )}

      <MenuButton
        label={displayName}
        ariaLabel="使用者選單"
        size="md"
        header={userHeader}
        items={userItems}
        className="flex flex-shrink-0 items-center gap-2 h-8 pl-1 pr-1.5 rounded-md
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors"
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full
                             bg-[var(--vw-accent-on-chrome)] text-[11px] font-bold text-[var(--vw-chrome-top)]">
              {avatarInitials(displayName)}
            </span>
            <span className="hidden sm:inline max-w-[160px] truncate text-[13px] text-[var(--vw-ink)]">{displayName}</span>
          </>
        }
      />
    </header>
  )
}
