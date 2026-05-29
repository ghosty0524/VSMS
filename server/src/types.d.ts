import 'express-session'

declare module 'express-session' {
  interface SessionData {
    sessionId?: string
    username?: string
    role?: 'super_admin' | 'admin'
  }
}