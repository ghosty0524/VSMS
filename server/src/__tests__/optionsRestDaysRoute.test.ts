// 休息日改成單筆 API：每次只改一筆、回傳完整清單，別的分頁開著舊設定頁也蓋不掉。
// 用記憶體 prisma stub：沒有獨立測試庫，絕不能打真的 DB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { state, upsert, auditSpy } = vi.hoisted(() => ({
  state: { stored: [] as unknown },
  upsert: vi.fn(),
  auditSpy: vi.fn(),
}))

vi.mock('../lib/db.js', () => {
  const tx = {
    restDaysConfig: {
      findUnique: async () => ({ id: 1, weekends: true, specificDates: state.stored }),
      upsert: async (args: { update: { specificDates: string[] } }) => {
        upsert(args)
        state.stored = args.update.specificDates
      },
    },
  }
  return {
    prisma: {
      ...tx,
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      user: { findUnique: async () => ({ username: 'boss', displayName: 'Boss' }) },
    },
  }
})
vi.mock('../lib/storage.js', () => ({ appendAudit: auditSpy }))

import optionsRouter from '../routes/options.js'

function app(role: string) {
  const a = express()
  a.use(express.json())
  a.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: 'boss', role } as unknown as Request['session']
    next()
  })
  a.use('/api/options', optionsRouter)
  return a
}

beforeEach(() => {
  state.stored = ['2026/10/26']
  upsert.mockReset()
  auditSpy.mockReset()
})

describe('POST /api/options/rest-days', () => {
  it('新增一筆並回傳排序後的完整清單、記稽核', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['新增 2026/10/09'])
  })

  it('也接受 YYYY-MM-DD，存成斜線', async () => {
    const res = await request(app('super_admin')).post('/api/options/rest-days').send({ date: '2026-12-25' })

    expect(res.body.specificDates).toEqual(['2026/10/26', '2026/12/25'])
  })

  it('已存在的日期：200、不寫入、不記稽核', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/26' })

    expect(res.status).toBe(200)
    expect(res.body.specificDates).toEqual(['2026/10/26'])
    expect(upsert).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('日期不合法：400、不寫入', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/02/30' })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('既有清單有不合法的日期：422 列出它、不寫入', async () => {
    state.stored = ['2026/10/26', '2026/13/01']
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(422)
    expect(res.body.message).toContain('2026/13/01')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('測試人員（user）403', async () => {
    const res = await request(app('user')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/options/rest-days/:date', () => {
  it('刪除一筆並記稽核', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/2026-10-26')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ weekends: true, specificDates: [] })
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['刪除 2026/10/26'])
  })

  it('不存在的日期：200、不寫入、不記稽核', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/2026-10-09')

    expect(res.status).toBe(200)
    expect(res.body.specificDates).toEqual(['2026/10/26'])
    expect(upsert).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('日期不合法：400', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/not-a-date')

    expect(res.status).toBe(400)
  })

  it('測試人員（user）403', async () => {
    const res = await request(app('user')).delete('/api/options/rest-days/2026-10-26')

    expect(res.status).toBe(403)
  })
})

describe('PUT /api/options 權限', () => {
  it('測試人員（user）403，不碰資料庫', async () => {
    const res = await request(app('user')).put('/api/options')
      .send({ categories: [], testUnits: [], devices: [], restDays: { weekends: true, specificDates: [] } })

    expect(res.status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })
})
