// server/src/lib/vauthClient.ts
// 與認證服務 vauth（同一台，loopback）對話。供 ssoAdopt（拿 SSO cookie 換身分）與
// ssoRecheck（定期確認 SSO session 是否還活著）用。
// 注意：這支與 VTMS/VSMS 既有、以 X-Api-Key 互查排程的 client（vtmsClient 那類）無關。
const VAUTH_URL = process.env.VAUTH_URL?.trim() || 'http://127.0.0.1:4100'

export interface VauthUser { id: string; username: string; displayName: string }

/** 帶使用者的 vportal_sso cookie 問 vauth「這是誰」。認得回 user，401/逾時/連不上回 null。 */
export async function getSsoUser(cookieHeader: string | undefined): Promise<VauthUser | null> {
  if (!cookieHeader || !cookieHeader.includes('vportal_sso')) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${VAUTH_URL}/auth/session`, { headers: { cookie: cookieHeader }, signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json() as { user?: VauthUser }
    return data.user ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type SsoSessionStatus = 'valid' | 'revoked' | 'unavailable'

/**
 * 只問「這個 SSO session 還有效嗎」，不解析使用者資料，供 ssoRecheck 節流輪詢用。
 * 明確的 401/403 才算 revoked；逾時、連不上、其他狀態碼一律算 unavailable ——
 * getSsoUser 把這些都當成 null，若 ssoRecheck 直接沿用會在 vauth 短暫斷線時
 * 把所有人一起登出，所以這裡拆成獨立分支，unavailable 由呼叫端決定要略過而非登出。
 */
export async function checkSsoSession(cookieHeader: string | undefined): Promise<SsoSessionStatus> {
  if (!cookieHeader || !cookieHeader.includes('vportal_sso')) return 'unavailable'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${VAUTH_URL}/auth/session`, { headers: { cookie: cookieHeader }, signal: controller.signal })
    if (res.ok) return 'valid'
    if (res.status === 401 || res.status === 403) return 'revoked'
    return 'unavailable'
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}
