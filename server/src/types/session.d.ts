import 'express-session'

declare module 'express-session' {
  interface SessionData {
    sessionId: string
    username: string
    role: 'super_admin' | 'admin' | 'user' | 'guest'
    /** ssoRecheck 上次確認 vauth SSO session 仍有效的時間戳（ms），節流用 */
    ssoCheckedAt?: number
  }
}