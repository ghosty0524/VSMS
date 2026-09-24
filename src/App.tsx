// src/App.tsx
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { LoginPage } from './components/layout/LoginPage'
import { ProtectedLayout } from './components/ProtectedLayout'
import { SessionExpiryWarning } from './components/shared/SessionExpiryWarning'
import { StaleBuildBanner } from './components/shared/StaleBuildBanner'
import { ToastHost } from './components/shared/ToastHost'
import { LoadingScreen } from './components/shared/LoadingScreen'
import { Topbar } from './components/layout/Topbar'
import { Sidebar } from './components/layout/Sidebar'
import { GanttChart } from './components/schedule/GanttChart'
import { SettingsPage } from './components/settings/SettingsPage'
import AnalyticsPage from './components/analytics/AnalyticsPage'
import AuditPage from './components/audit/AuditPage'

export function App() {
  const { isLoggedIn, isChecking, checkAuth, role, guestLogin } = useAuthStore()
  const authProvider = useAuthStore(s => s.authProvider)
  const {
    view, setView,
    showAddModal, setShowAddModal,
    filterCollapsed, setFilterCollapsed,
  } = useUIStore()

  useEffect(() => { checkAuth() }, [checkAuth])

  // 入口頁的訪客連結（?guest=1）：意圖在掛載時記一次就好，網址參數隨即拿掉。
  // 之前把「拿掉參數 → 發訪客登入」寫在 render 裡，登入還沒回來前只要再 render 一次
  // （StrictMode、第二次 checkAuth 落地）就看不到參數而導回入口頁——實機「訪客要按
  // 好幾次才進得去」就是這個時序。改成 state + effect：pending 期間不導走、只發一次。
  const [guestPending, setGuestPending] = useState(
    () => new URLSearchParams(window.location.search).get('guest') === '1',
  )
  const guestStarted = useRef(false)
  useEffect(() => {
    if (!guestPending || isChecking || isLoggedIn || authProvider !== 'vauth') return
    if (guestStarted.current) return
    guestStarted.current = true
    window.history.replaceState(null, '', window.location.pathname)
    void guestLogin().finally(() => setGuestPending(false))
  }, [guestPending, isChecking, isLoggedIn, authProvider, guestLogin])

  useEffect(() => {
    if ((role === 'user' || role === 'guest') && view !== 'main') {
      setView('main')
    }
  }, [role, view, setView])

  if (isChecking) return <LoadingScreen text="連線中…" />

  if (!isLoggedIn) {
    if (authProvider === 'vauth') {
      // 單一登入模式：入口頁的「以訪客身分瀏覽 VSMS」帶 ?guest=1 進來，直接以訪客登入
      // （上面的 effect 負責發請求，這裡只要在登入還沒回來前不要導走）；
      // 其餘一律導回入口頁登入（與 VTMS 一致，2026-09-21 起不再顯示本地的兩選項頁）。
      if (guestPending) return <LoadingScreen text="以訪客身分進入…" />
      window.location.replace('/')
      return <LoadingScreen text="導向入口頁…" />
    }
    return <LoginPage />
  }

  return (
    <ProtectedLayout>
      <div className="h-screen app-ground flex flex-col">
        {/* 全域頂欄（UI 統一 4A）。頂欄下方是「左側欄＋內容區」一列（UI 統一 4C）；
            只有一個可見頁面的角色（測試人員、訪客）不渲染側欄，內容區佔滿寬度。
            整頁是 h-screen、不捲動，頂欄因此一直在最上面；側欄高度＝視窗扣掉頂欄，自己捲動。 */}
        <Topbar />
        <div className="flex-1 min-h-0 flex">
          <Sidebar
            currentView={view}
            onNavigate={setView}
            role={role}
          />
          {/* min-w-0：甘特圖的 SVG 比內容區寬，靠內層的橫向捲動容器吸收，不能讓它撐開這一列。
              側欄收合時內容區跟著變寬，甘特圖寬度由 CSS 決定，不需要重算。 */}
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {view === 'main' && (
              <div className="h-full p-3">
                <GanttChart
                  showAddModal={showAddModal}
                  onAddSchedule={() => setShowAddModal(true)}
                  onCloseAddModal={() => setShowAddModal(false)}
                  filterCollapsed={filterCollapsed}
                  onToggleFilter={() => setFilterCollapsed(!filterCollapsed)}
                />
              </div>
            )}
            {view === 'analytics' && (role === 'super_admin' || role === 'admin') && (
              <div className="h-full overflow-y-auto">
                <AnalyticsPage />
              </div>
            )}
            {view === 'settings' && (role === 'super_admin' || role === 'admin') && (
              <div className="h-full overflow-y-auto">
                <SettingsPage />
              </div>
            )}
            {view === 'audit' && role === 'super_admin' && (
              <div className="h-full overflow-y-auto">
                <AuditPage />
              </div>
            )}
          </main>
        </div>
        <SessionExpiryWarning />
        <StaleBuildBanner />
        {/* 全站唯一的通知渲染點。Header 與 GanttChart 原本各自有 fixed 定位的
            通知，同時出現會互相遮蔽，現在共用 store/toastStore 的同一個佇列。 */}
        <ToastHost />
      </div>
    </ProtectedLayout>
  )
}