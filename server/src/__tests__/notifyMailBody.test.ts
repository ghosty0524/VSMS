import { describe, it, expect } from 'vitest'
import { buildTemplateVars, buildMailBody } from '../lib/notifyMailBody.js'
import type { ScheduleForMail } from '../lib/notifyMailBody.js'
import type { ResolvedRule } from '../lib/notifyRule.js'

const schedule: ScheduleForMail = {
  projectName: 'Falcon-X 車載模組',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/26',
  endDate: '2026/09/02',
  timeResource: 5,
  requiredPersonnel: 'Amy_Chen, Kevin_Yu',
}

const rule: ResolvedRule = {
  enabled: true,
  subject: '[VSMS 排程預告] {{projectName}} 將於 {{startDate}} 啟動',
  intro: '{{testUnit}} 單位提醒：請於測試前完成樣品備妥。',
  outro: '如需異動請洽窗口。',
  ccRaw: '',
}

const vars = buildTemplateVars(schedule, 'https://vsms.local:3001', 3)

describe('buildTemplateVars', () => {
  it('stringifies timeResource and daysUntilStart', () => {
    expect(vars.timeResource).toBe('5')
    expect(vars.daysUntilStart).toBe('3')
  })
  it('carries the schedule fields through unchanged', () => {
    expect(vars.projectName).toBe('Falcon-X 車載模組')
    expect(vars.systemUrl).toBe('https://vsms.local:3001')
  })
})

describe('buildMailBody', () => {
  it('renders the subject template', () => {
    expect(buildMailBody(rule, schedule, vars).subject)
      .toBe('[VSMS 排程預告] Falcon-X 車載模組 將於 2026/08/26 啟動')
  })

  it('puts intro before the data table and outro after it, in the text version', () => {
    const { text } = buildMailBody(rule, schedule, vars)
    expect(text).toContain('EMC 單位提醒：請於測試前完成樣品備妥。')
    expect(text.indexOf('EMC 單位提醒')).toBeLessThan(text.indexOf('測試工程師'))
    expect(text.indexOf('測試工程師')).toBeLessThan(text.indexOf('如需異動請洽窗口。'))
  })

  it('includes every fixed table field in the text version', () => {
    const { text } = buildMailBody(rule, schedule, vars)
    for (const label of ['專案名稱', '測試單位', '測試工程師', '機台', '任務說明', '起迄日期', '工時']) {
      expect(text).toContain(label)
    }
    expect(text).toContain('Chamber-A')
    expect(text).toContain('2026/08/26 ~ 2026/09/02')
  })

  it('appends the system link to both versions', () => {
    const { text, html } = buildMailBody(rule, schedule, vars)
    expect(text).toContain('https://vsms.local:3001')
    expect(html).toContain('href="https://vsms.local:3001"')
  })

  it('escapes angle brackets from schedule data in the HTML version', () => {
    const risky = { ...schedule, projectName: 'Falcon<X>' }
    const riskyVars = buildTemplateVars(risky, 'https://vsms.local:3001', 3)
    const { html } = buildMailBody(rule, risky, riskyVars)
    expect(html).toContain('Falcon&lt;X&gt;')
    expect(html).not.toContain('<X>')
  })

  it('omits the intro block entirely when the template is blank', () => {
    const blank: ResolvedRule = { ...rule, intro: '', outro: '' }
    const { text, html } = buildMailBody(blank, schedule, vars)
    expect(text).not.toContain('\n\n\n')
    expect(html).not.toContain('<p></p>')
  })
})
