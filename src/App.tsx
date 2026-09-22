// src/App.tsx
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { useNotificationStore } from './store/notificationStore'
import { LoginPage } from './components/layout/LoginPage'
import { ProtectedLayout } from './components/ProtectedLayout'
import { SessionExpiryWarning } from './components/shared/SessionExpiryWarning'
import { StaleBuildBanner } from './components/shared/StaleBuildBanner'
import { ToastHost } from './components/shared/ToastHost'
import { LoadingScreen } from './components/shared/LoadingScreen'
import { Header } from './components/layout/Header'
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

  const loadNotifications = useNotificationStore(s => s.load)

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

  // vauth 模式下每 60 秒輪詢一次通知（分頁不可見時不打）；guest 是虛擬帳號、
  // deny-by-default，不該讓它連 /notify/inbox 都碰得到。
  useEffect(() => {
    if (!isLoggedIn || authProvider !== 'vauth' || role === 'guest') return
    let timer: number | undefined
    const tick = () => { if (document.visibilityState === 'visible') void loadNotifications() }
    tick()
    timer = window.setInterval(tick, 60_000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [isLoggedIn, authProvider, role, loadNotifications])

  useEffect(() => {
    if (view === 'teams') setView('main')
  }, [view, setView])

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
        <Header
          currentView={view}
          onNavigate={setView}
          role={role}
        />
        <main className="flex-1 min-h-0 overflow-hidden">
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
        <SessionExpiryWarning />
        <StaleBuildBanner />
        {/* 全站唯一的通知渲染點。Header 與 GanttChart 原本各自有 fixed 定位的
            通知，同時出現會互相遮蔽，現在共用 store/toastStore 的同一個佇列。 */}
        <ToastHost />
      </div>
    </ProtectedLayout>
  )
}