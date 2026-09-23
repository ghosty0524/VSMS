import { describe, expect, it } from 'vitest'
import { STATUS_LABELS, statusLabel, type ScheduleStatus } from '../lib/status'

describe('status labels', () => {
  it('maps every status to the shared Chinese wording', () => {
    expect(STATUS_LABELS).toEqual({
      Planned: '計畫中',
      Testing: '測試中',
      Completed: '已完成',
      Delayed: '延遲',
      Cancelled: '已取消',
    })
  })

  it('statusLabel returns the label for each status', () => {
    const all: ScheduleStatus[] = ['Planned', 'Testing', 'Completed', 'Delayed', 'Cancelled']
    expect(all.map(statusLabel)).toEqual(['計畫中', '測試中', '已完成', '延遲', '已取消'])
  })
})
