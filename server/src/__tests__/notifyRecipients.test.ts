import { describe, it, expect } from 'vitest'
import { resolveRecipients, planRecipients } from '../lib/notifyRecipients.js'

const DOMAIN = 'example.com.tw'

describe('resolveRecipients', () => {
  it('appends the domain to a single account name', () => {
    expect(resolveRecipients('Amy_Chen', DOMAIN)).toEqual({
      addresses: ['Amy_Chen@example.com.tw'],
      unresolved: [],
    })
  })

  it('splits on comma, ideographic comma, semicolon and whitespace', () => {
    const r = resolveRecipients('Amy_Chen, Kevin_Yu、Grace_Chen; Will_Wang Ben_Lin', DOMAIN)
    expect(r.addresses).toEqual([
      'Amy_Chen@example.com.tw',
      'Kevin_Yu@example.com.tw',
      'Grace_Chen@example.com.tw',
      'Will_Wang@example.com.tw',
      'Ben_Lin@example.com.tw',
    ])
    expect(r.unresolved).toEqual([])
  })

  it('splits on fullwidth comma and fullwidth semicolon', () => {
    const r = resolveRecipients('Amy_Chen，Kevin_Yu；Grace_Chen', DOMAIN)
    expect(r.addresses).toHaveLength(3)
  })

  it('passes through a token that already contains @ without appending the domain', () => {
    const r = resolveRecipients('wang@other.com, Amy_Chen', DOMAIN)
    expect(r.addresses).toEqual(['wang@other.com', 'Amy_Chen@example.com.tw'])
  })

  it('deduplicates case-insensitively, keeping the first spelling', () => {
    const r = resolveRecipients('Amy_Chen, amy_chen, Amy_Chen', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
  })

  it('ignores empty tokens left by trailing or doubled separators', () => {
    const r = resolveRecipients(' , Amy_Chen ,, ', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
    expect(r.unresolved).toEqual([])
  })

  it('reports a token that cannot form a valid address as unresolved', () => {
    const r = resolveRecipients('Amy_Chen, 王小明@, @broken', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
    expect(r.unresolved).toEqual(['王小明@', '@broken'])
  })

  it('reports every token as unresolved when the domain is blank', () => {
    const r = resolveRecipients('Amy_Chen, Kevin_Yu', '')
    expect(r.addresses).toEqual([])
    expect(r.unresolved).toEqual(['Amy_Chen', 'Kevin_Yu'])
  })

  it('returns empty results for an empty field', () => {
    expect(resolveRecipients('', DOMAIN)).toEqual({ addresses: [], unresolved: [] })
    expect(resolveRecipients('   ', DOMAIN)).toEqual({ addresses: [], unresolved: [] })
  })
})

describe('planRecipients', () => {
  const base = {
    requiredPersonnel: 'Amy_Chen',
    testEngineer: 'Darius_Chang',
    ruleCcRaw: 'dept_head, emc_window',
    fallbackRaw: 'fallback@example.com.tw',
    mailDomain: DOMAIN,
  }

  it('puts the test engineer in cc after the rule cc recipients', () => {
    const plan = planRecipients(base)
    expect(plan.to).toEqual(['Amy_Chen@example.com.tw'])
    expect(plan.cc).toEqual([
      'dept_head@example.com.tw',
      'emc_window@example.com.tw',
      'Darius_Chang@example.com.tw',
    ])
    expect(plan.usingFallback).toBe(false)
  })

  it('keeps the test engineer in cc on the fallback path but drops the rule cc', () => {
    // 代收情境下規則副本要清空——那批人不該收到寄錯對象的信；測試人員留著，
    // 他是最有能力指出正確需求人員的人。
    const plan = planRecipients({ ...base, requiredPersonnel: '   ' })
    expect(plan.to).toEqual(['fallback@example.com.tw'])
    expect(plan.cc).toEqual(['Darius_Chang@example.com.tw'])
    expect(plan.usingFallback).toBe(true)
  })

  it('does not repeat the test engineer already listed in the rule cc', () => {
    const plan = planRecipients({ ...base, ruleCcRaw: 'dept_head, darius_chang' })
    expect(plan.cc).toEqual(['dept_head@example.com.tw', 'darius_chang@example.com.tw'])
  })

  it('omits the test engineer from cc when they are already a to recipient', () => {
    // 測試人員同時是需求人員時，不去重就會 To 一次、CC 一次寄兩封給同一人。
    const plan = planRecipients({
      ...base, requiredPersonnel: 'Darius_Chang', ruleCcRaw: '',
    })
    expect(plan.to).toEqual(['Darius_Chang@example.com.tw'])
    expect(plan.cc).toEqual([])
  })

  it('silently drops a test engineer that cannot form a valid address', () => {
    // 與規則副本一致的處理方式：解析不出來就略過，不擋整封信。
    const plan = planRecipients({ ...base, testEngineer: '@broken', ruleCcRaw: 'dept_head' })
    expect(plan.cc).toEqual(['dept_head@example.com.tw'])
    expect(plan.unresolved).toEqual([])
  })

  it('reports the unresolved requiredPersonnel tokens', () => {
    const plan = planRecipients({ ...base, requiredPersonnel: '王小明@' })
    expect(plan.usingFallback).toBe(true)
    expect(plan.unresolved).toEqual(['王小明@'])
  })

  it('returns an empty to when neither requiredPersonnel nor the fallback resolves', () => {
    const plan = planRecipients({ ...base, requiredPersonnel: '', fallbackRaw: '' })
    expect(plan.to).toEqual([])
    expect(plan.usingFallback).toBe(true)
  })
})
