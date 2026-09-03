// src/App.tsx
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
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
  const { isLoggedIn, isChecking, checkAuth, role } = useAuthStore()
  const {
    view, setView,
    showAddModal, setShowAddModal,
    filterCollapsed, setFilterCollapsed,
  } = useUIStore()

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (view === 'teams') setView('main')
  }, [view, setView])

  useEffect(() => {
    if ((role === 'user' || role === 'guest') && view !== 'main') {
      setView('main')
    }
  }, [role, view, setView])

  if (isChecking) return <LoadingScreen text="連線中…" />

  if (!isLoggedIn) return <LoginPage />

  return (
    <ProtectedLayout>
      <div className="h-screen bg-gray-100 flex flex-col">
        <Header
          currentView={view}
          onNavigate={setView}
          onAddSchedule={() => setShowAddModal(true)}
          role={role}
        />
        <main className="flex-1 min-h-0 overflow-hidden">
          {view === 'main' && (
            <div className="h-full p-3">
              <GanttChart
                showAddModal={showAddModal}
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