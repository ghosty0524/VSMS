import { useState } from 'react'
import { Check, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

// 輸入框（UI 統一 4B 共用視覺值）：高 40px、左右內距 12px、1px --vw-border-strong、
// 圓角 6px、14px 字。focus 環沿用 VSMS 的 blue（已重新定義成青綠）。
const INPUT_CLASS =
  'w-full h-10 px-3 text-sm border border-[var(--vw-border-strong)] rounded-md ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export function LoginPage() {
  const { login, guestLogin, loginError, loginWarning, clearErrors, isChecking } = useAuthStore()
  const authProvider = useAuthStore(s => s.authProvider)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent, force?: boolean) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setSubmitting(true)
    clearErrors()
    await login(username, password, force)
    setSubmitting(false)
  }

  const handleGuestLogin = async () => {
    setSubmitting(true)
    clearErrors()
    await guestLogin()
    setSubmitting(false)
  }

  if (isChecking) {
    return (
      <div className="h-screen flex items-center justify-center app-ground">
        <p className="text-gray-400 text-sm">連線中…</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex items-center justify-center app-ground">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          {/* Validation Workspace 標誌：與全域頂欄（4A）同一個勾勾圖形，28×28、圓角 7px、底色 --vw-accent */}
          <div data-testid="login-logo" aria-hidden="true"
            className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-[var(--vw-accent)] text-white mb-4">
            <Check size={18} strokeWidth={3} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">VSMS</h1>
          <p className="text-sm text-gray-500 mt-1">Validation Schedule Management System</p>
        </div>

        {/* ✅ 人數上限錯誤提示 */}
        {loginError && loginError.includes('上限') && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Users size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{loginError}</p>
            </div>
          </div>
        )}

        {/* Duplicate session warning */}
        {loginWarning && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 mb-3">{loginWarning}</p>
            <div className="flex gap-2">
              <button type="button"
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
                disabled={submitting}
                className="flex-1 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                繼續登入
              </button>
              <button type="button"
                onClick={() => { setUsername(''); setPassword(''); clearErrors() }}
                className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 單一登入模式（vauth）下 App 會直接導回入口頁，這個頁面只在 local 模式出現。 */}
        {/* Login form */}
        {authProvider !== 'vauth' && !loginWarning && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號"
                autoFocus
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className={INPUT_CLASS}
              />
            </div>

            {/* 一般錯誤訊息（非上限錯誤） */}
            {loginError && !loginError.includes('上限') && (
              <p className="text-red-500 text-xs">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password.trim()}
              className="w-full h-11 bg-stone-900 text-white text-[15px] font-semibold rounded-md
                hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
            >
              {submitting ? '登入中…' : '登入'}
            </button>

            {/* 訪客入口（唯讀） */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400">或</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={submitting}
              className="w-full py-2.5 text-sm font-medium rounded-lg border border-gray-300
                text-gray-600 hover:bg-gray-50 hover:border-gray-400
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              以訪客身分瀏覽（唯讀）
            </button>
          </form>
        )}
      </div>
    </div>
  )
}