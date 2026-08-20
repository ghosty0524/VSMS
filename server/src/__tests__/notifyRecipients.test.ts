import { describe, it, expect } from 'vitest'
import { resolveRecipients } from '../lib/notifyRecipients.js'

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
