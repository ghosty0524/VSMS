import { describe, expect, it } from 'vitest'
import { generateDashboardHTML } from '../dashboard/template'
import type { OptionsMap } from '../types'

const emptyOptions: OptionsMap = {
  categories: [],
  testUnits: [],
  restDays: { weekends: true, specificDates: [] },
  devices: [],
}

describe('exported dashboard status text', () => {
  it('shows Chinese status labels in the filter but keeps English values and classes', () => {
    const html = generateDashboardHTML([], emptyOptions)
    expect(html).toContain('value="Completed"')
    expect(html).toContain('status-Completed')
    expect(html).toMatch(/status-Completed">已完成</)
    expect(html).not.toMatch(/status-Completed">Completed</)
  })

  it('embeds the Chinese STATUS_LABELS map in the exported inline script', () => {
    const html = generateDashboardHTML([], emptyOptions)
    expect(html).toMatch(/'Completed':\s*'已完成'/)
  })
})
