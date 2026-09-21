import type { Request, Response, NextFunction } from 'express'
import { checkSsoSession } from '../lib/vauthClient.js'
import { endLocalSession } from '../routes/auth.js'

// 節流間隔：入口頁撤銷 SSO session（帳號停用／登出）後，最慢多久內反映到 VSMS 本地 session。
export const SSO_RECHECK_MS = 60_000

/**
 * 單一登出的另一半：ssoAdopt 只管「帶 SSO cookie 進來時換一個本地 session」，
 * 但換好之後本地 session 就活在自己的世界裡，直到閒置逾時——入口頁停用帳號或撤銷
 * SSO session 不會提早結束它。這裡每隔 SSO_RECHECK_MS 問一次 vauth「這個 SSO
 * session 還在嗎」，撤銷就同步結束本地 session，讓失效在一分鐘內傳播過來。
 *
 * 只在 AUTH_PROVIDER=vauth、已有本地 session（req.session.sessionId）、非 guest、
 * 且請求帶著 vportal_sso cookie 時作用；guest 本來就不是 SSO 認領來的，略過。
 * vauth 連不上（'unavailable'）視為暫時不知道，不登出、也不更新節流戳記，下一個
 * 請求會再試——否則 vauth 短暫斷線會把所有 vauth 使用者一起登出。
 */
export async function ssoRecheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.AUTH_PROVIDER !== 'vauth') { next(); return }
  if (!req.session.sessionId) { next(); return }
  if (req.session.role === 'guest') { next(); return }
  const cookie = req.headers.cookie
  if (!cookie || !cookie.includes('vportal_sso')) { next(); return }

  const checkedAt = req.session.ssoCheckedAt ?? 0
  if (Date.now() - checkedAt < SSO_RECHECK_MS) { next(); return }

  const status = await checkSsoSession(cookie)

  if (status === 'unavailable') { next(); return }

  if (status === 'valid') {
    req.session.ssoCheckedAt = Date.now()
    next()
    return
  }

  // status === 'revoked'
  endLocalSession(req)
  req.session.destroy(() => {
    res.status(401).json({ ok: false, code: 'SSO_REVOKED', message: '單一登入已失效，請重新登入' })
  })
}
