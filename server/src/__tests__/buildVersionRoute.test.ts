// server/src/__tests__/buildVersionRoute.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildVersionRouter } from '../routes/build.js'

describe('GET /api/build', () => {
  it('distPath 為空時回傳 { build: 0}', async () => {
    const app = express()
    app.use(buildVersionRouter(''))

    const res = await request(app).get('/api/build')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ build: 0 })
  })

  it('distPath 有 index.html 時回傳其 mtime（ms）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsms-build-route-'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>')
    const app = express()
    app.use(buildVersionRouter(dir))

    const res = await request(app).get('/api/build')

    expect(res.status).toBe(200)
    expect(typeof res.body.build).toBe('number')
    expect(res.body.build).toBeGreaterThan(0)
  })
})
