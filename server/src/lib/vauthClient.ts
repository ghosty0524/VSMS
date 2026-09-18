// server/src/lib/vauthClient.ts
// 與認證服務 vauth（同一台，loopback）對話。目前只需「拿 SSO cookie 換身分」，供 ssoAdopt 用。
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
