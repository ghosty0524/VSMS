// server/src/routes/users.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { sha256 } from '../lib/crypto.js'
import { requireAuth, requireSuperAdmin } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

// Helper: strip passwordHash from Prisma user
function safeUser(u: {
  id: string; username: string; displayName: string; role: string;
  isActive: boolean; allowedUnits: unknown; linkedEngineer: string;
  createdAt: Date; lastLoginAt: Date | null
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    allowedUnits: (u.allowedUnits as string[]) ?? [],
    linkedEngineer: u.linkedEngineer,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? '',
  }
}

// GET /api/users
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(users.map(safeUser))
})

// POST /api/users
router.post('/', async (req, res) => {
  const { username, displayName, password, allowedUnits, role, linkedEngineer } = req.body as {
    username: string
    displayName?: string
    password: string
    allowedUnits?: string[]
    role?: 'admin' | 'user'
    linkedEngineer?: string
  }

  if (!username || !password || password.length < 8) {
    res.status(400).json({ ok: false, message: '帳號與密碼為必填，密碼至少 8 個字元' })
    return
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    res.status(409).json({ ok: false, message: '帳號已存在' })
    return
  }

  const newUser = await prisma.user.create({
    data: {
      id: uuidv4(),
      username,
      displayName: displayName?.trim() || username,
      passwordHash: sha256(password),
      role: role === 'user' ? 'user' : 'admin',
      isActive: true,
      allowedUnits: role === 'user' ? [] : (Array.isArray(allowedUnits) ? allowedUnits : []),
      linkedEngineer: role === 'user' ? (linkedEngineer?.trim() ?? '') : '',
    },
  })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'CREATE_USER', username, [])

  res.status(201).json(safeUser(newUser))
})

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { displayName, password, isActive, allowedUnits, linkedEngineer } = req.body as {
    displayName?: string
    password?: string
    isActive?: boolean
    allowedUnits?: string[]
    linkedEngineer?: string
  }
  const changedFields: string[] = []
  const updates: Record<string, unknown> = {}

  if (displayName !== undefined) {
    updates.displayName = displayName.trim() || dbUser.username
    changedFields.push('displayName')
  }

  if (password !== undefined && password !== '') {
    if (password.length < 8) {
      res.status(400).json({ ok: false, message: '新密碼長度至少需要 8 個字元' })
      return
    }
    updates.passwordHash = sha256(password)
    changedFields.push('passwordHash')
  }

  if (isActive !== undefined) {
    if (dbUser.role === 'super_admin') {
      res.status(403).json({ ok: false, message: 'Super Admin 狀態不可變更' })
      return
    }
    updates.isActive = isActive
    changedFields.push('isActive')
  }

  if (allowedUnits !== undefined && dbUser.role !== 'super_admin') {
    updates.allowedUnits = Array.isArray(allowedUnits) ? allowedUnits : []
    changedFields.push('allowedUnits')
  }

  if (linkedEngineer !== undefined) {
    if (dbUser.role !== 'user') {
      res.status(400).json({ ok: false, message: 'linkedEngineer 欄位僅適用於 User 角色帳號' })
      return
    }
    updates.linkedEngineer = linkedEngineer.trim()
    changedFields.push('linkedEngineer')
  }

  if (changedFields.length === 0) {
    res.status(400).json({ ok: false, message: '未提供任何要更新的欄位' })
    return
  }

  const updated = await prisma.user.update({ where: { id: dbUser.id }, data: updates })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'UPDATE_USER', dbUser.username, changedFields)

  res.json(safeUser(updated))
})

// DELETE /api/users/:id — soft disable
router.delete('/:id', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (dbUser.role === 'super_admin') {
    res.status(403).json({ ok: false, message: 'Super Admin 不可停用' })
    return
  }

  await prisma.user.update({ where: { id: dbUser.id }, data: { isActive: false } })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'DISABLE_USER', dbUser.username, ['isActive'])

  res.json({ ok: true })
})

// DELETE /api/users/:id/permanent
router.delete('/:id/permanent', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (dbUser.role === 'super_admin') {
    res.status(403).json({ ok: false, message: 'Super Admin 不可刪除' })
    return
  }
  if (dbUser.isActive) {
    res.status(400).json({ ok: false, message: '請先停用帳號再執行刪除' })
    return
  }

  await prisma.user.delete({ where: { id: dbUser.id } })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'DISABLE_USER', dbUser.username, ['permanently_deleted'])

  res.json({ ok: true, message: `帳號 ${dbUser.displayName} 已永久刪除` })
})

export default router
