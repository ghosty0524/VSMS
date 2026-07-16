import { describe, it, expect } from 'vitest'
import { completedAtPatch } from '../lib/completedAt.js'

describe('completedAtPatch', () => {
  it('sets completedAt when transitioning false→true', () => {
    const patch = completedAtPatch(false, true)
    expect(patch).toHaveProperty('completedAt')
    expect((patch as { completedAt: Date }).completedAt).toBeInstanceOf(Date)
  })
  it('clears completedAt when transitioning true→false', () => {
    expect(completedAtPatch(true, false)).toEqual({ completedAt: null })
  })
  it('returns empty patch when isCompleted not in payload', () => {
    expect(completedAtPatch(true, undefined)).toEqual({})
    expect(completedAtPatch(false, undefined)).toEqual({})
  })
  it('returns empty patch when value unchanged', () => {
    expect(completedAtPatch(true, true)).toEqual({})
    expect(completedAtPatch(false, false)).toEqual({})
  })
})
