import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'

export function LoginPage() {
  const { login, loginError, loginWarning, clearErrors, isChecking } = useAuthStore()
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

  if (isChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-400 text-sm">連線中…</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">VSMS</h1>
          <p className="text-sm text-gray-500 mt-1">Validation Schedule Management System</p>
        </div>

        {/* ✅ 人數上限錯誤提示 */}
        {loginError && loginError.includes('上限') && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-base">🚫</span>
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

        {/* Login form */}
        {!loginWarning && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 一般錯誤訊息（非上限錯誤） */}
            {loginError && !loginError.includes('上限') && (
              <p className="text-red-500 text-xs">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password.trim()}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
            >
              {submitting ? '登入中…' : '登入'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}