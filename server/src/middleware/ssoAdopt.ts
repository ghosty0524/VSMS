import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/db.js'
import { getSsoUser } from '../lib/vauthClient.js'
import { establishSession } from '../routes/auth.js'

/**
 * 單一登入認領：入口頁登入後帶 vportal_sso cookie 進到 /vsms/，這裡換成本地 session，
 * 之後走 VSMS 自己的 session 與閒置逾時。只在 AUTH_PROVIDER=vauth 時作用（預設 local＝no-op）。
 * 已有 session、帶 header token、無 cookie 一律略過；vauth 認不得就當沒發生，讓 requireAuth 照擋。
 */
export async function ssoAdopt(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (process.env.AUTH_PROVIDER !== 'vauth') return next()
  if (req.session.sessionId) return next()
  if (req.headers['x-vsms-session']) return next()
  const cookie = req.headers.cookie
  if (!cookie || !cookie.includes('vportal_sso')) return next()

  const ssoUser = await getSsoUser(cookie)
  if (!ssoUser) return next()

  // 帳號生命週期歸 vauth（設計 C）：本地沒有就補一列預設角色 user 的成員資料。
  let dbUser = await prisma.user.findUnique({ where: { id: ssoUser.id } })
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
