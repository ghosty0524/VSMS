import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import request from 'supertest'
import { errorHandler, GENERIC_ERROR_MESSAGE } from '../middleware/errorHandler.js'

// 洩漏過的真實案例：修正前 POST /api/login 送 {"username":"admin"} 會回 500，
// body 裡直接帶著 bcrypt 的 "Illegal arguments: undefined, string"。
const LEAKY = 'Illegal arguments: undefined, string'

function buildApp(handler: express.RequestHandler): express.Express {
  const app = express()
  app.use(express.json())
  app.all('/boom', handler)
  app.use(errorHandler)
  return app
}

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('errorHandler — 回應不得洩漏內部細節', () => {
  it('500 的 body 帶固定通用訊息，不帶 err.message', async () => {
    const app = buildApp(() => { throw new Error(LEAKY) })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR')
    expect(res.body.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(JSON.stringify(res.body)).not.toContain(LEAKY)
  })

  it('丟出的不是 Error（字串／物件）時同樣不得回傳其內容', async () => {
    const app = buildApp(() => { throw { sql: 'SELECT password FROM users' } })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(500)
    expect(res.body.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(JSON.stringify(res.body)).not.toContain('SELECT password')
  })

  it('堆疊不會出現在回應裡', async () => {
    const app = buildApp(() => { throw new Error(LEAKY) })

    const res = await request(app).post('/boom').send({})

    expect(JSON.stringify(res.body)).not.toContain('errorHandler.test')
    expect(res.body).not.toHaveProperty('stack')
  })
})

describe('errorHandler — correlation id', () => {
  it('回應帶 errorId，且與日誌記的是同一個 id', async () => {
    const app = buildApp(() => { throw new Error(LEAKY) })

    const res = await request(app).post('/boom').send({})

    expect(res.body.errorId).toMatch(/^[0-9a-f]{12}$/)
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(logged).toContain(res.body.errorId)
  })

  it('日誌仍保留完整例外（含堆疊）', async () => {
    const app = buildApp(() => { throw new Error(LEAKY) })

    await request(app).post('/boom').send({})

    // console.error(msg, err) 的第二個參數要是原始 Error，堆疊才查得到
    const call = errorSpy.mock.calls.find((c: unknown[]) => c[1] instanceof Error)
    expect(call).toBeDefined()
    expect((call![1] as Error).message).toBe(LEAKY)
    expect((call![1] as Error).stack).toBeTruthy()
    expect(String(call![0])).toContain('POST /boom')
  })

  it('每一筆請求給不同的 id', async () => {
    const app = buildApp(() => { throw new Error(LEAKY) })

    const a = await request(app).post('/boom').send({})
    const b = await request(app).post('/boom').send({})

    expect(a.body.errorId).not.toBe(b.body.errorId)
  })
})

describe('errorHandler — err.status／statusCode', () => {
  it('帶 4xx status 的錯誤照原狀態碼回，不會被誤報成 500', async () => {
    const app = buildApp(() => {
      const err = Object.assign(new Error(LEAKY), { status: 403 })
      throw err
    })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(JSON.stringify(res.body)).not.toContain(LEAKY)
  })

  it('statusCode 欄位（express.static 用的是這個）同樣要認得', async () => {
    const app = buildApp(() => {
      const err = Object.assign(new Error(LEAKY), { statusCode: 400 })
      throw err
    })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
  })

  it('4xx 不用 console.error 汙染錯誤日誌', async () => {
    const app = buildApp(() => { throw Object.assign(new Error(LEAKY), { status: 404 }) })

    await request(app).post('/boom').send({})

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('5xx 的 status 一律壓成 500 通用訊息', async () => {
    const app = buildApp(() => { throw Object.assign(new Error(LEAKY), { status: 503 }) })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('不合法的 status（非數字／超出範圍）退回 500', async () => {
    const app = buildApp(() => { throw Object.assign(new Error(LEAKY), { status: 'nope' }) })

    const res = await request(app).post('/boom').send({})

    expect(res.status).toBe(500)
  })
})

describe('errorHandler — 真實 express 錯誤來源', () => {
  it('JSON body 壞掉時回 400，不洩漏解析器訊息', async () => {
    const app = express()
    app.use(express.json())
    app.post('/boom', (_req, res) => { res.json({ ok: true }) })
    app.use(errorHandler)

    const res = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"username": ')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('BAD_REQUEST')
    expect(res.body.message).not.toMatch(/JSON|token|position/i)
  })

  it('sendFile 找不到檔案時回 404，且不洩漏伺服器檔案路徑', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsms-eh-'))
    const missing = path.join(dir, 'index.html')
    const app = express()
    app.get('/boom', (_req, res) => { res.sendFile(missing) })
    app.use(errorHandler)

    const res = await request(app).get('/boom')

    expect(res.status).toBe(404)
    expect(JSON.stringify(res.body)).not.toContain('index.html')
    expect(JSON.stringify(res.body)).not.toContain(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('errorHandler — 已送出標頭', () => {
  it('headersSent 之後交回 express 預設處理，不再寫 body', async () => {
    const app = express()
    app.get('/boom', (_req, res) => {
      res.status(200).write('partial')
      throw new Error(LEAKY)
    })
    app.use(errorHandler)

    const res = await request(app).get('/boom').catch(e => e)

    expect(res.text ?? '').not.toContain(LEAKY)
  })
})
