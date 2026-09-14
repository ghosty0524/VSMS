import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { sha256, verifyPassword } from '../lib/crypto.js'

// 一個合法的 bcrypt 雜湊（60 字元、$2b$ 開頭），內容不重要 —— 這些案例都應該
// 在碰到 bcrypt 之前就被擋下來。
const BCRYPT_HASH = '$2b$12$abcdefghijklmnopqrstuuOm2FMlM.rHkiVMLeFxOFmn8lE3bO0e'

describe('verifyPassword 對非字串輸入的防線', () => {
  it('密碼是 undefined 時回 false，不拋例外（bcrypt 雜湊）', async () => {
    await expect(verifyPassword(undefined as unknown as string, BCRYPT_HASH)).resolves.toBe(false)
  })

  it('密碼是 undefined 時回 false，不拋例外（legacy SHA-256 雜湊）', async () => {
    // 舊帳號走的是 sha256 分支，那條路徑會在 createHash().update() 炸開，
    // 錯誤訊息跟 bcrypt 的完全不同，只修 bcrypt 那一半會留下第二條當機路徑。
    await expect(verifyPassword(undefined as unknown as string, sha256('secret'))).resolves.toBe(false)
  })

  it('密碼是數字／物件／null 一律回 false', async () => {
    for (const bad of [123, {}, [], null, true]) {
      await expect(verifyPassword(bad as unknown as string, BCRYPT_HASH)).resolves.toBe(false)
    }
  })

  it('storedHash 不是字串時拋出明確錯誤，而不是靜默回 false', async () => {
    // DB 資料壞掉不能被當成「密碼錯誤」—— 那會變成帳號永遠登不進去又查不出原因。
    await expect(verifyPassword('secret', undefined as unknown as string))
      .rejects.toThrow(/storedHash/)
  })
})

const prismaMock = {
  user: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock('../lib/db.js', () => ({ prisma: prismaMock }))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn() }))

async function makeApp() {
  const { default: authRouter } = await import('../routes/auth.js')
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as unknown as { session: Record<string, unknown> }).session = {
      sessionId: 'sid-1', username: 'admin', role: 'super_admin',
    }
    next()
  })
  app.use('/api', authRouter)
  return app
}

describe('POST /api/login 缺少 password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.count.mockResolvedValue(3)
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1', username: 'admin', displayName: 'Admin',
      passwordHash: BCRYPT_HASH, role: 'super_admin', isActive: true,
    })
  })

  it('回 400 而不是 500，且不外洩內部錯誤訊息', async () => {
    const app = await makeApp()
    const res = await request(app).post('/api/login').send({ username: 'admin' })

    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain('Illegal arguments')
  })

  it('password 是非字串型別時同樣回 400', async () => {
    const app = await makeApp()
    for (const bad of [123, [], {}, null]) {
      const res = await request(app).post('/api/login').send({ username: 'admin', password: bad })
      expect(res.status).toBe(400)
    }
  })

  it('在查詢使用者之前就擋下來，不浪費一次 DB 查詢', async () => {
    const app = await makeApp()
    await request(app).post('/api/login').send({ username: 'admin' })
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
  })
})

describe('POST /api/change-password 缺少 oldPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1', username: 'admin', displayName: 'Admin',
      passwordHash: BCRYPT_HASH, role: 'super_admin', isActive: true,
    })
  })

  it('回 400 而不是 500', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/change-password')
      .send({ newPassword: 'newpassword123' })

    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain('Illegal arguments')
  })
})

describe('密碼長度檢查對非字串型別同樣有效', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1', username: 'admin', displayName: 'Admin',
      passwordHash: BCRYPT_HASH, role: 'super_admin', isActive: true,
    })
  })

  it('change-password：newPassword 是數字時回 400，不會掉進 hashPassword', async () => {
    // `(12345678).length` 是 undefined，`undefined < 8` 為 false，
    // 所以純長度檢查會讓數字穿過去，在 bcrypt.hash 裡才炸開。
    const app = await makeApp()
    // 舊密碼要先過驗證才會走到 newPassword 檢查，所以這裡給一個真的會通過的組合。
    const { hashPassword } = await import('../lib/crypto.js')
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1', username: 'admin', displayName: 'Admin',
      passwordHash: await hashPassword('oldpassword'), role: 'super_admin', isActive: true,
    })
    const res = await request(app)
      .post('/api/change-password')
      .send({ oldPassword: 'oldpassword', newPassword: 12345678 })

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('首次啟動：password 是數字時回 400，不會建出壞掉的 Super Admin', async () => {
    vi.clearAllMocks()
    prismaMock.user.count.mockResolvedValue(0)
    const app = await makeApp()
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 12345678 })

    expect(res.status).toBe(400)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })
})
