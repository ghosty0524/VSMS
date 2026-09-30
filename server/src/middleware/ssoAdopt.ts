import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/db.js'
import { getSsoUser } from '../lib/vauthClient.js'
import { establishSession } from '../routes/auth.js'
import { tokenStore } from '../lib/sessionTokens.js'

/**
 * 單一登入認領：入口頁登入後帶 vportal_sso cookie 進到 /vsms/，這裡換成本地 session，
 * 之後走 VSMS 自己的 session 與閒置逾時。只在 AUTH_PROVIDER=vauth 時作用（預設 local＝no-op）。
 * 已有 session、帶「還有效的」header token、無 cookie 一律略過；vauth 認不得就當沒發生，讓 requireAuth 照擋。
 */
export async function ssoAdopt(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (process.env.AUTH_PROVIDER !== 'vauth') return next()
  if (req.session.sessionId) return next()
  // header token 要真的還在 tokenStore 裡才算數。前端把本地／訪客登入拿到的 token 放在分頁的
  // sessionStorage，只有按登出才清；訪客 session 閒置失效後 token 還會跟著每個請求送來，
  // 原本「看到 header 就略過」讓 SSO 已登入的人永遠認領不到、被 401 踢回入口頁，而且
  // 伺服器端沒有任何紀錄（2026-09-30 實際案例）。
  const headerToken = req.headers['x-vsms-session']
  if (typeof headerToken === 'string' && tokenStore.get(headerToken)) return next()
  const cookie = req.headers.cookie
  if (!cookie || !cookie.includes('vportal_sso')) return next()

  const ssoUser = await getSsoUser(cookie)
  if (!ssoUser) return next()

  // 帳號生命週期歸 vauth（設計 C）：本地沒有就補一列預設角色 user 的成員資料。
  // 身分鍵是帳號名稱：既有 VSMS 帳號的 id 與 vauth 不同（各自產生），只用 id 找會找不到、
  // 再新建就撞 users_username_key 而 500。先比對帳號名稱，新建時才沿用 vauth 的 id。
  let dbUser = await prisma.user.findUnique({ where: { username: ssoUser.username } })
  if (!dbUser) dbUser = await prisma.user.findUnique({ where: { id: ssoUser.id } })
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: ssoUser.id,
        username: ssoUser.username,
        displayName: ssoUser.displayName || ssoUser.username,
        passwordHash: '!',
        role: 'user',
        isActive: true,
        allowedUnits: [],
      },
    })
  }
  if (!dbUser.isActive) return next()

  await establishSession(req, dbUser)
  next()
}
