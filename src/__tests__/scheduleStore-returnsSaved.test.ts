// src/__tests__/scheduleStore-returnsSaved.test.ts
// 表單儲存後要拿到新排程的 id 才能呼叫 vtms-link，所以 add / update 要回傳
// 後端回來的 Schedule；replaceInStore 讓關聯後的回應可以寫回清單。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useScheduleStore } from '../store/scheduleStore'
import type { Schedule } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

const base: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
  category: 'SIT', projectName: 'PDN-1', taskDescription: 'x', testUnit: 'RA', testEngineer: 'Ben_Ko',
  timeResource: 1, startDate: '2026/09/10', endDate: '2026/09/11', requiredPersonnel: '', testReport: '',
  isCompleted: false, isDelayed: false, isCancelled: false, completedAt: null, delayReason: '',
  adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
}
const saved = (over: Partial<Schedule>): Schedule => ({
  ...base, id: 's1', createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z',
  createdBy: 'a', updatedBy: 'a', ...over,
})

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

beforeEach(() => { useScheduleStore.setState({ schedules: [] }) })

describe('scheduleStore', () => {
  it('add 回傳後端建立的 Schedule 並加進清單', async () => {
    stubFetch(saved({ id: 'new-1' }))
    const result = await useScheduleStore.getState().add(base)
    expect(result.id).toBe('new-1')
    expect(useScheduleStore.getState().schedules.map(s => s.id)).toEqual(['new-1'])
  })

  it('update 回傳更新後的 Schedule', async () => {
    useScheduleStore.setState({ schedules: [saved({ id: 's1', testReport: '' })] })
    stubFetch(saved({ id: 's1', testReport: 'done' }))
    const result = await useScheduleStore.getState().update('s1', { testReport: 'done' })
    expect(result.testReport).toBe('done')
    expect(useScheduleStore.getState().schedules[0].testReport).toBe('done')
  })

  it('replaceInStore 以 id 取代既有那筆，不新增', async () => {
    useScheduleStore.setState({ schedules: [saved({ id: 's1' }), saved({ id: 's2' })] })
    useScheduleStore.getState().replaceInStore(saved({ id: 's1', vtmsPlanId: 'plan-9' }))
    const list = useScheduleStore.getState().schedules
    expect(list).toHaveLength(2)
    expect(list.find(s => s.id === 's1')?.vtmsPlanId).toBe('plan-9')
  })
})
