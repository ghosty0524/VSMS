import { describe, it, expect, vi } from 'vitest'
import { notifyScheduleAssigned } from '../lib/scheduleNotify.js'

const sched = { id: 's1', projectName: 'PDN-1', testEngineer: 'Rock_Cai', startDate: '2026/10/01', endDate: '2026/10/03', updatedAt: new Date('2026-09-21T00:00:00.000Z') }

describe('notifyScheduleAssigned', () => {
  it('新建：對應到帳號就送一則 inapp', async () => {
    const deliver = vi.fn(async () => ({ id: 'd', deduped: false, dropped: false }))
    await notifyScheduleAssigned({ schedule: sched }, { deliver, findAccount: async () => ({ id: 'u1' }) })
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ key: 'schedule_assigned:s1:2026-09-21T00:00:00.000Z', channels: ['inapp'], recipients: [{ userId: 'u1' }], title: '你有一筆排程：PDN-1', body: '2026/10/01 ～ 2026/10/03', linkUrl: '/vsms/' }))
  })
  it('更新但人與日期都沒變 → 不送；日期變 → 送；找不到帳號 → 不送；deliver 丟例外 → 吞掉', async () => {
    const deliver = vi.fn(async () => ({ id: 'd', deduped: false, dropped: false }))
    const findAccount = async () => ({ id: 'u1' })
    await notifyScheduleAssigned({ schedule: sched, previous: { testEngineer: 'Rock_Cai', startDate: '2026/10/01', endDate: '2026/10/03' } }, { deliver, findAccount })
    expect(deliver).not.toHaveBeenCalled()
    await notifyScheduleAssigned({ schedule: sched, previous: { testEngineer: 'Rock_Cai', startDate: '2026/09/30', endDate: '2026/10/03' } }, { deliver, findAccount })
    expect(deliver).toHaveBeenCalledTimes(1)
    await notifyScheduleAssigned({ schedule: sched }, { deliver, findAccount: async () => null })
    expect(deliver).toHaveBeenCalledTimes(1)
    const boom = vi.fn(async () => { throw new Error('x') })
    await expect(notifyScheduleAssigned({ schedule: sched }, { deliver: boom, findAccount })).resolves.toBeUndefined()
  })
})
