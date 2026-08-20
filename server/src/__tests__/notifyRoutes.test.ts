import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { templateFieldErrors } from '../routes/notify.js'

describe('templateFieldErrors', () => {
  it('returns no errors when every template is valid', () => {
    expect(templateFieldErrors({
      subjectTemplate: '[VSMS] {{projectName}}',
      introTemplate: null,
      outroTemplate: '',
    })).toEqual({})
  })

  it('names the offending field and the unknown variable', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{projectNmae}}',
      introTemplate: null,
      outroTemplate: null,
    })
    expect(errors.subjectTemplate).toContain('projectNmae')
  })

  it('reports each bad field separately', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{foo}}',
      introTemplate: '{{bar}}',
      outroTemplate: null,
    })
    expect(Object.keys(errors).sort()).toEqual(['introTemplate', 'subjectTemplate'])
  })

  it('ignores a null template', () => {
    expect(templateFieldErrors({
      subjectTemplate: null, introTemplate: null, outroTemplate: null,
    })).toEqual({})
  })
})

describe('notify router guards', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const { default: notifyRouter } = await import('../routes/notify.js')
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => { (req as unknown as { session: object }).session = {}; next() })
    app.use('/api/notify', notifyRouter)

    const res = await request(app).get('/api/notify/config')
    expect(res.status).toBe(401)
  })

  // catchUpDays: 0 是刻意的偏離 —— runner 現在會用它算補寄視窗起點
  // (addDays(today, -catchUpDays))，等於 0 時視窗收斂成單一天：失敗的
  // 寄送沒有隔天可以重試（attempts 停在 1/3），且該筆會被吸收進
  // missedWindow，不會以錯誤的形式浮現出來。所以 API 要在存檔時就擋下，
  // 不能讓管理者存進一個會靜默壞掉重試機制的值。這條驗證發生在觸碰資料庫
  // 之前，所以不需要真的接資料庫就能測。
  it('rejects catchUpDays of 0 with 422 before touching the database', async () => {
    const { default: notifyRouter } = await import('../routes/notify.js')
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      (req as unknown as { session: object }).session = {
        sessionId: 'test-session', username: 'admin', role: 'admin',
      }
      next()
    })
    app.use('/api/notify', notifyRouter)

    const res = await request(app).put('/api/notify/config').send({ catchUpDays: 0 })
    expect(res.status).toBe(422)
    expect(res.body.errors.catchUpDays).toBeTruthy()
  })
})
