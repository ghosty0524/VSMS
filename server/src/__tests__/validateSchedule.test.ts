// server/src/__tests__/validateSchedule.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { validateSchedule } from '../middleware/validateSchedule.js'

const app = express()
app.use(express.json())
app.post('/test', validateSchedule, (_req, res) => { res.json({ ok: true }) })

const validBody = {
  projectName: 'Test Project',
  taskDescription: 'Description',
  testUnit: 'SIT-HW',
  testEngineer: 'John',
  timeResource: 5,
  startDate: '2026/01/01',
  endDate: '2026/01/31',
  requiredPersonnel: 'John',
  testReport: '',
  isCompleted: false,
  isDelayed: false,
  delayReason: '',
}

describe('validateSchedule middleware', () => {
  it('passes a valid schedule body', async () => {
    const res = await request(app).post('/test').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('rejects empty projectName', async () => {
    const res = await request(app).post('/test').send({ ...validBody, projectName: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.projectName).toBeDefined()
  })

  it('rejects projectName over 100 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, projectName: 'A'.repeat(101) })
    expect(res.status).toBe(422)
    expect(res.body.errors.projectName).toBeDefined()
  })

  it('rejects empty testUnit', async () => {
    const res = await request(app).post('/test').send({ ...validBody, testUnit: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.testUnit).toBeDefined()
  })

  it('rejects non-integer timeResource', async () => {
    const res = await request(app).post('/test').send({ ...validBody, timeResource: 2.5 })
    expect(res.status).toBe(422)
    expect(res.body.errors.timeResource).toBeDefined()
  })

  it('rejects zero timeResource', async () => {
    const res = await request(app).post('/test').send({ ...validBody, timeResource: 0 })
    expect(res.status).toBe(422)
    expect(res.body.errors.timeResource).toBeDefined()
  })

  it('rejects startDate with wrong format (dashes)', async () => {
    const res = await request(app).post('/test').send({ ...validBody, startDate: '2026-01-01' })
    expect(res.status).toBe(422)
    expect(res.body.errors.startDate).toBeDefined()
  })

  it('rejects endDate before startDate', async () => {
    const res = await request(app).post('/test').send({ ...validBody, startDate: '2026/02/01', endDate: '2026/01/01' })
    expect(res.status).toBe(422)
    expect(res.body.errors.endDate).toBeDefined()
  })

  it('rejects missing delayReason when isDelayed is true', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.delayReason).toBeDefined()
  })

  it('rejects delayReason over 5000 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: 'A'.repeat(5001) })
    expect(res.status).toBe(422)
    expect(res.body.errors.delayReason).toBeDefined()
  })

  it('accepts delayReason exactly 5000 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: 'A'.repeat(5000) })
    expect(res.status).toBe(200)
  })

  it('returns all errors at once when multiple fields are invalid', async () => {
    const res = await request(app).post('/test').send({
      ...validBody,
      projectName: '',
      testUnit: '',
      timeResource: -1,
    })
    expect(res.status).toBe(422)
    expect(Object.keys(res.body.errors).length).toBeGreaterThanOrEqual(3)
  })
})
