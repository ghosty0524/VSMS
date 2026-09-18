// server/src/__tests__/canonicalRedirect.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { canonicalRedirect } from '../middleware/canonicalRedirect.js'

function appWith(base: string | undefined) {
  const app = express()
  app.use(canonicalRedirect(base))
  app.get('/{*splat}', (_req, res) => { res.send('spa') })
  return app
}

describe('canonicalRedirect', () => {
  it('未設定 PUBLIC_BASE_URL 時不轉向', async () => {
    const res = await request(appWith(undefined)).get('/').set('Accept', 'text/html')
    expect(res.status).toBe(200)
  })

  it('直接打舊網址的 HTML 導覽轉到正式網址並保留路徑與查詢', async () => {
    const res = await request(appWith('https://172.16.204.69/vsms/')).get('/?tab=analytics').set('Accept', 'text/html')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://172.16.204.69/vsms/?tab=analytics')
  })

  it('經代理進來（帶 x-forwarded-prefix）不轉向', async () => {
    const res = await request(appWith('https://172.16.204.69/vsms')).get('/').set('Accept', 'text/html').set('x-forwarded-prefix', '/vsms')
    expect(res.status).toBe(200)
  })

  it('非 HTML 請求（API 客戶端、MCP）不轉向', async () => {
    const res = await request(appWith('https://172.16.204.69/vsms')).get('/api/health').set('Accept', 'application/json')
    expect(res.status).toBe(200)
  })

  it('非 GET 不轉向', async () => {
    const app = express()
    app.use(canonicalRedirect('https://172.16.204.69/vsms'))
    app.post('/api/login', (_req, res) => { res.send('ok') })
    const res = await request(app).post('/api/login').set('Accept', 'text/html')
    expect(res.status).toBe(200)
  })
})

describe('trust proxy loopback', () => {
  it('來自 loopback 的 X-Forwarded-For 會成為 req.ip', async () => {
    const app = express()
    app.set('trust proxy', 'loopback')
    app.get('/ip', (req, res) => { res.json({ ip: req.ip }) })
    const res = await request(app).get('/ip').set('X-Forwarded-For', '10.1.2.3')
    expect(res.body.ip).toBe('10.1.2.3')
  })
})
