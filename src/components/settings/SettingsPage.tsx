import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { CategoryManager } from './CategoryManager'
import { TestUnitManager } from './TestUnitManager'
import { EngineerManager } from './EngineerManager'
import { RestDaysManager } from './RestDaysManager'
import { UserManager } from './UserManager'
import { DeviceManager } from './DeviceManager'
import CalendarImport from './CalendarImport'

type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices'

export function SettingsPage() {
  const { role } = useAuthStore()
  const { settingsTab, setSettingsTab } = useUIStore()
  const isSuperAdmin = role === 'super_admin'

  const tabs: { key: SettingsTab; label: string; superAdminOnly?: boolean }[] = [
    { key: 'categories', label: '工作類別' },
    { key: 'units',      label: '測試單位' },
    { key: 'engineers',  label: '測試人員' },
    { key: 'restdays',   label: '休息日設定' },
    { key: 'devices',    label: '設備管理' },
    { key: 'users',      label: '帳號管理', superAdminOnly: true },
  ]

  const visibleTabs = tabs.filter((t) => !t.superAdminOnly || isSuperAdmin)

  // ✅ 確保目前 tab 對此角色可見，否則回到第一個
  const activeTab = (visibleTabs.find((t) => t.key === settingsTab)
    ? settingsTab
    : visibleTabs[0]?.key ?? 'categories') as SettingsTab

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">系統設定</h2>

      {/* Tab 列 */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {visibleTabs.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setSettingsTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key
                ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {t.superAdminOnly && (
              <span className="ml-1.5 text-xs bg-purple-100 text-purple-600 px-1 rounded">SA</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 內容 */}
      <div className="bg-white rounded-xl shadow p-5">
        {activeTab === 'categories' && <CategoryManager />}
        {activeTab === 'units'      && <TestUnitManager />}
        {activeTab === 'engineers'  && <EngineerManager />}

        {activeTab === 'restdays' && (
          <div className="flex flex-col gap-6">
            {/* ── Super Admin 專屬：行事曆原檔匯入 ── */}
            {isSuperAdmin && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-gray-700">政府辦公日曆匯入</span>
                  <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">SA</span>
                </div>
                <CalendarImport />
                {/* 分隔線 */}
                <div className="mt-6 border-t border-gray-200" />
                <div className="mt-4 text-sm font-semibold text-gray-700 mb-3">
                  手動休息日設定
                </div>
              </div>
            )}

            {/* ── 全角色可見：原 RestDaysManager ── */}
            <RestDaysManager />
          </div>
        )}

        {activeTab === 'devices' && <DeviceManager />}
        {activeTab === 'users' && isSuperAdmin && <UserManager />}
      </div>
    </div>
  )
}