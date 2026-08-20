import { describe, it, expect } from 'vitest'
import { resolveRule } from '../lib/notifyRule.js'
import type { NotifyRuleRow } from '../lib/notifyRule.js'

const defaultRule: NotifyRuleRow = {
  id: 'default',
  testUnit: null,
  enabled: true,
  subjectTemplate: '[VSMS 排程預告] {{projectName}}',
  introTemplate: '以下排程即將啟動：',
  outroTemplate: '如有疑問請洽測試部。',
  ccRecipients: 'dept_head',
}

const emcRule: NotifyRuleRow = {
  id: 'emc',
  testUnit: 'EMC',
  enabled: true,
  subjectTemplate: null,
  introTemplate: 'EMC 單位提醒：請於測試前完成樣品備妥。',
  outroTemplate: null,
  ccRecipients: 'emc_window',
}

describe('resolveRule', () => {
  it('falls back to the default rule when the unit has none', () => {
    const r = resolveRule('RF', [defaultRule])
    expect(r).toEqual({
      enabled: true,
      subject: '[VSMS 排程預告] {{projectName}}',
      intro: '以下排程即將啟動：',
      outro: '如有疑問請洽測試部。',
      ccRaw: 'dept_head',
    })
  })

  it('uses the unit value where set and the default where null', () => {
    const r = resolveRule('EMC', [defaultRule, emcRule])
    expect(r?.subject).toBe('[VSMS 排程預告] {{projectName}}')     // null → 沿用預設
    expect(r?.intro).toBe('EMC 單位提醒：請於測試前完成樣品備妥。') // 覆寫
    expect(r?.outro).toBe('如有疑問請洽測試部。')                   // null → 沿用預設
  })

  it('treats an empty string as a deliberate blank, not as inherit', () => {
    const blanked: NotifyRuleRow = { ...emcRule, outroTemplate: '' }
    expect(resolveRule('EMC', [defaultRule, blanked])?.outro).toBe('')
  })

  it('concatenates the default cc with the unit cc', () => {
    expect(resolveRule('EMC', [defaultRule, emcRule])?.ccRaw).toBe('dept_head, emc_window')
  })

  it('omits the separator when one side has no cc', () => {
    const noCc: NotifyRuleRow = { ...emcRule, ccRecipients: '' }
    expect(resolveRule('EMC', [defaultRule, noCc])?.ccRaw).toBe('dept_head')
    const noDefaultCc: NotifyRuleRow = { ...defaultRule, ccRecipients: '' }
    expect(resolveRule('EMC', [noDefaultCc, emcRule])?.ccRaw).toBe('emc_window')
  })

  it('reports the unit rule as disabled even when the default is enabled', () => {
    const off: NotifyRuleRow = { ...emcRule, enabled: false }
    expect(resolveRule('EMC', [defaultRule, off])?.enabled).toBe(false)
  })

  it('reports the unit rule as enabled even when the default is disabled', () => {
    // 上線策略依賴這個組合：預設規則關閉，再逐一開啟單位。
    const defaultOff: NotifyRuleRow = { ...defaultRule, enabled: false }
    expect(resolveRule('EMC', [defaultOff, emcRule])?.enabled).toBe(true)
  })

  it('uses the default enabled flag for a unit with no rule of its own', () => {
    const off: NotifyRuleRow = { ...defaultRule, enabled: false }
    expect(resolveRule('RF', [off])?.enabled).toBe(false)
  })

  it('returns null when no default rule exists', () => {
    expect(resolveRule('EMC', [emcRule])).toBeNull()
  })

  it('treats a null template on the default rule as an empty string', () => {
    const bare: NotifyRuleRow = { ...defaultRule, introTemplate: null, outroTemplate: null }
    const r = resolveRule('RF', [bare])
    expect(r?.intro).toBe('')
    expect(r?.outro).toBe('')
  })
})
