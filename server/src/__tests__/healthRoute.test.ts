// server/src/__tests__/healthRoute.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { healthRouter } from '../routes/health.js'

const base = { service: 'vsms', version: '1.0.0', deployedAt: () => '2026-09-18T01:00:00.000Z' }

describe('GET /api/health', () => {
  it('DB 正常時回 200 與統一格式', async () => {
    const app = express()
    app.use(healthRouter({ ...base, checkDb: async () => {} }))

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'vsms',
      version: '1.0.0',
      deployedAt: '2026-09-18T01:00:00.000Z',
      checks: { db: 'ok' },
    })
    expect(typeof res.body.time).toBe('string')
  })

  it('DB 丟錯時回 503、status down', async () => {
    const app = express()
    app.use(healthRouter({ ...base, checkDb: async () => { throw new Error('x') } }))

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('down')
    expect(res.body.checks.db).toBe('down')
  })

  it('DB 逾時視同 down', async () => {
    const app = express()
    app.use(healthRouter({ ...base, timeoutMs: 20, checkDb: () => new Promise(() => {}) }))

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body.checks.db).toBe('down')
  })

  it('deployedAt 不明時回 null', async () => {
    const app = express()
    app.use(healthRouter({ ...base, deployedAt: () => null, checkDb: async () => {} }))

    const res = await request(app).get('/api/health')

    expect(res.body.deployedAt).toBeNull()
  })
})
