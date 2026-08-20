import { describe, it, expect } from 'vitest'
import { validateTemplate, renderTemplate, escapeHtml, TEMPLATE_VARS } from '../lib/notifyTemplate.js'
import type { TemplateVars } from '../lib/notifyTemplate.js'

const vars: TemplateVars = {
  projectName: 'Falcon-X 車載模組',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/26',
  endDate: '2026/09/02',
  timeResource: '5',
  requiredPersonnel: 'Amy_Chen, Kevin_Yu',
  daysUntilStart: '3',
  systemUrl: 'https://vsms.local:3001',
}

describe('validateTemplate', () => {
  it('accepts a template using only whitelisted variables', () => {
    expect(validateTemplate('{{projectName}} 於 {{startDate}} 啟動')).toEqual({ ok: true })
  })
  it('accepts a template with no variables at all', () => {
    expect(validateTemplate('請提前備妥樣品。')).toEqual({ ok: true })
  })
  it('rejects an unknown variable and names it', () => {
    expect(validateTemplate('{{projectNmae}} 啟動')).toEqual({ ok: false, unknown: ['projectNmae'] })
  })
  it('reports each unknown variable once, in order of first appearance', () => {
    const r = validateTemplate('{{foo}} {{bar}} {{foo}}')
    expect(r).toEqual({ ok: false, unknown: ['foo', 'bar'] })
  })
  it('tolerates whitespace inside the braces', () => {
    expect(validateTemplate('{{ projectName }}')).toEqual({ ok: true })
  })
  it('lists every documented variable as valid', () => {
    for (const name of TEMPLATE_VARS) {
      expect(validateTemplate(`{{${name}}}`)).toEqual({ ok: true })
    }
  })
})

describe('renderTemplate', () => {
  it('substitutes whitelisted variables', () => {
    expect(renderTemplate('{{projectName}} / {{testUnit}}', vars))
      .toBe('Falcon-X 車載模組 / EMC')
  })
  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('{{ startDate }}', vars)).toBe('2026/08/26')
  })
  it('leaves an unknown placeholder untouched rather than emitting undefined', () => {
    expect(renderTemplate('{{nope}} 啟動', vars)).toBe('{{nope}} 啟動')
  })
  it('returns an empty string for an empty template', () => {
    expect(renderTemplate('', vars)).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that break HTML', () => {
    expect(escapeHtml(`<a href="x" alt='y'>&`))
      .toBe('&lt;a href=&quot;x&quot; alt=&#39;y&#39;&gt;&amp;')
  })
  it('escapes ampersands before the other entities', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Falcon-X 車載模組')).toBe('Falcon-X 車載模組')
  })
})
