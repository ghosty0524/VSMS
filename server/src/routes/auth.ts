// server/src/routes/auth.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { sha256 } from '../lib/crypto.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { User } from '../types.js'

const router = Router()

// ── Session management ──────────────────────────────────────
const MAX_SESSIONS = 30
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

interface SessionInfo {
  sessionId: string
  username: string
  loginAt: Date
  lastActiveAt: Date
}

const activeSessions = new Map<string, SessionInfo>()

function cleanExpiredSessions(): void {
  const now = new Date()
  for (const [sid, info] of activeSessions.entries()) {
    if (now.getTime() - info.lastActiveAt.getTime() > SESSION_TIMEOUT_MS) {
      activeSessions.delete(sid)
    }
  }
}

function getActiveUserCount(): number {
  cleanExpiredSessions()
  const uniqueUsers = new Set([...activeSessions.values()].map(s => s.username))
  return uniqueUsers.size
}

function touchSession(sessionId: string): void {
  const info = activeSessions.get(sessionId)
  if (info) info.lastActiveAt = new Date()
}

// Helper: map Prisma User → app User type
function toUser(u: {
  id: string; username: string; displayName: string; passwordHash: string;
  role: string; isActive: boolean; allowedUnits: unknown; linkedEngineer: string;
  createdAt: Date; lastLoginAt: Date | null
}): User {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    passwordHash: u.passwordHash,
    role: u.role as User['role'],
    isActive: u.isActive,
    allowedUnits: (u.allowedUnits as string[]) ?? [],
    linkedEngineer: u.linkedEngineer,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? '',
  }
}

// ── POST /api/login ────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password, force } = req.body as {
    username?: string
    password: string
    force?: boolean
  }

  const userCount = await prisma.user.count()

  // First run: create Super Admin
  if (userCount === 0) {
    if (!password || password.length < 8) {
      res.status(400).json({ ok: false, message: '密碼至少需要 8 個字元' })
      return
    }
    const initUsername = username?.trim() || 'admin'
    const superAdmin = await prisma.user.create({
      data: {
        id: uuidv4(),
        username: initUsername,
        displayName: 'Super Admin',
        passwordHash: sha256(password),
        role: 'super_admin',
        isActive: true,
        allowedUnits: [],
        linkedEngineer: '',
      },
    })

    const sid = uuidv4()
    req.session.sessionId = sid
    req.session.username = superAdmin.username
    req.session.role = superAdmin.role as 'super_admin' | 'admin' | 'user'

    activeSessions.set(sid, {
      sessionId: sid,
      username: superAdmin.username,
      loginAt: new Date(),
      lastActiveAt: new Date(),
    })

    await appendAudit(superAdmin.username, superAdmin.displayName, 'LOGIN', 'system')
    res.json({ ok: true, firstRun: true })
    return
  }

  // Normal login
  const loginUsername = username?.trim() || 'admin'
  const dbUser = await prisma.user.findFirst({
    where: { username: loginUsername, isActive: true },
  })

  if (!dbUser || sha256(password) !== dbUser.passwordHash) {
    res.status(401).json({ ok: false, message: '帳號或密碼錯誤' })
    return
  }

  cleanExpiredSessions()

  const existingEntry = [...activeSessions.entries()]
    .find(([, info]) => info.username === loginUsername)

  const otherUserCount = new Set(
    [...activeSessions.values()]
      .filter(s => s.username !== loginUsername)
      .map(s => s.username)
  ).size

  if (!existingEntry && otherUserCount >= MAX_SESSIONS) {
    res.status(403).json({
      ok: false,
      message: `目前已達登入人數上限（${MAX_SESSIONS} 人），請稍後再試`,
      code: 'MAX_SESSIONS_REACHED',
    })
    return
  }

  const hasDuplicate = !!existingEntry && existingEntry[0] !== req.session.sessionId
  if (hasDuplicate && !force) {
    res.json({ ok: false, warning: 'duplicate_session' })
    return
  }

  if (existingEntry) activeSessions.delete(existingEntry[0])

  const sid = uuidv4()
  req.session.sessionId = sid
  req.session.username = dbUser.username
  req.session.role = dbUser.role as 'super_admin' | 'admin' | 'user'

  activeSessions.set(sid, {
    sessionId: sid,
    username: dbUser.username,
    loginAt: new Date(),
    lastActiveAt: new Date(),
  })

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { lastLoginAt: new Date() },
  })

  await appendAudit(dbUser.username, dbUser.displayName, 'LOGIN', 'system')
  res.json({ ok: true })
})

// ── POST /api/logout ───────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'LOGOUT', 'system')

  if (req.session.sessionId) activeSessions.delete(req.session.sessionId)
  req.session.destroy(() => res.json({ ok: true }))
})

// ── GET /api/me ────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { username: req.session.username } })
  if (!dbUser) {
    res.status(401).json({ ok: false, message: 'User not found' })
    return
  }

  if (req.session.sessionId) touchSession(req.session.sessionId)

  res.json({
    ok: true,
    username: dbUser.username,
    displayName: dbUser.displayName,
    role: dbUser.role,
    allowedUnits: (dbUser.allowedUnits as string[]) ?? [],
    linkedEngineer: dbUser.linkedEngineer ?? '',
  })
})

// ── GET /api/sessions ──────────────────────────────────────
router.get('/sessions', requireAuth, (req, res) => {
  if (req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: '權限不足' })
    return
  }

  cleanExpiredSessions()
  const sessions = [...activeSessions.values()].map(s => ({
    username: s.username,
    loginAt: s.loginAt,
    lastActiveAt: s.lastActiveAt,
  }))

  res.json({
    ok: true,
    activeCount: getActiveUserCount(),
    maxSessions: MAX_SESSIONS,
    sessions,
  })
})

// ── POST /api/change-password ──────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body as {
    oldPassword: string
    newPassword: string
  }

  const dbUser = await prisma.user.findUnique({ where: { username: req.session.username } })
  if (!dbUser) {
    res.status(404).json({ ok: false, message: 'User not found' })
    return
  }
  if (sha256(oldPassword) !== dbUser.passwordHash) {
    res.status(401).json({ ok: false, message: '舊密碼錯誤' })
    return
  }
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ ok: false, message: '新密碼至少需要 8 個字元' })
    return
  }

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: sha256(newPassword) },
  })
  await appendAudit(dbUser.username, dbUser.displayName, 'UPDATE_USER', dbUser.username, ['passwordHash'])
  res.json({ ok: true })
})

export default router
