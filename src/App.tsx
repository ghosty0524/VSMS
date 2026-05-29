// src/App.tsx
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { LoginPage } from './components/layout/LoginPage'
import { ProtectedLayout } from './components/ProtectedLayout'
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
    ganttCollapsed, setGanttCollapsed,
    filterCollapsed, setFilterCollapsed,
  } = useUIStore()

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (role === 'user' && view !== 'main') {
      setView('main')
    }
  }, [role, view, setView])

  if (isChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-400 text-sm">連線中…</p>
      </div>
    )
  }

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
                ganttCollapsed={ganttCollapsed}
                onToggleGantt={() => setGanttCollapsed(!ganttCollapsed)}
                filterCollapsed={filterCollapsed}
                onToggleFilter={() => setFilterCollapsed(!filterCollapsed)}
              />
            </div>
          )}
          {view === 'analytics' && role !== 'user' && (
            <div className="h-full overflow-y-auto">
              <AnalyticsPage />
            </div>
          )}
          {view === 'settings' && role !== 'user' && (
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
    </ProtectedLayout>
  )
}