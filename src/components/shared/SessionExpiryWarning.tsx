import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { api, getLastApiActivityAt } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

const WARN_BEFORE_MIN = 3
const CHECK_INTERVAL_MS = 30_000

/**
 * 閒置逾時前提醒：session 逾時前 3 分鐘顯示，點「繼續使用」以 /api/me
 * 刷新 session（cookie 為 rolling，任一請求即延長）。
 */
export function SessionExpiryWarning() {
  const { sessionTimeoutMin, logout } = useAuthStore()
  const [show, setShow] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const check = () => {
      const idleMs = Date.now() - getLastApiActivityAt()
      const warnAtMs = Math.max(1, sessionTimeoutMin - WARN_BEFORE_MIN) * 60_000
      setShow(idleMs >= warnAtMs)
    }
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [sessionTimeoutMin])

  if (!show) return null

  const keepAlive = async () => {
    setRefreshing(true)
    try {
      await api.me()
      setShow(false)
    } catch {
      // session 已在伺服器端失效，回登入頁
      logout()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-100 text-amber-600 mb-3">
          <Clock size={22} />
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">閒置過久，即將自動登出</h3>
        <p className="text-sm text-gray-500 mb-5">
          您已閒置一段時間，session 將於約 {WARN_BEFORE_MIN} 分鐘內逾時。
        </p>
        <button
          type="button"
          onClick={keepAlive}
          disabled={refreshing}
          className="w-full py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg
            hover:bg-stone-800 disabled:opacity-50 transition-colors"
        >
          {refreshing ? '延長中…' : '繼續使用'}
        </button>
      </div>
    </div>
  )
}
