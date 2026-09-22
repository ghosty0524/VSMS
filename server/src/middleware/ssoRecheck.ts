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
  // 公開的探測端點（前端載入時先打 /api/config 才知道自己在 vauth 模式）：只結束
  // 本地 session、讓請求以未登入身分繼續。若在這裡就回 401，前端會把 authProvider
  // 退回 local、顯示本地登入頁而不是導回入口頁。
  const path = (req.originalUrl ?? req.url).split('?')[0]
  const passThrough = PUBLIC_PROBE_PATHS.has(path)
  endLocalSession(req)
  if (passThrough) {
    // 放行時不能用 destroy()：express-session 的 destroy 會把 req.session 整個拿掉，
    // 接在後面的 guestReadOnly → applyHeaderAuth 讀 req.session.sessionId 就會
    // 丟 TypeError，探測端點變成 500（2026-09-21 撤銷 SSO 測試時實際發生）。
    // regenerate() 一樣會刪掉 store 裡的舊 session，但接著換上一個全新的空 session，
    // 讓請求以匿名身分繼續走完。
    req.session.regenerate(() => next())
    return
  }
  req.session.destroy(() => {
    res.status(401).json({ ok: false, code: 'SSO_REVOKED', message: '單一登入已失效，請重新登入' })
  })
}

/** 免登入的探測端點：撤銷時只清 session 放行，不回 401。 */
const PUBLIC_PROBE_PATHS = new Set(['/api/config'])
