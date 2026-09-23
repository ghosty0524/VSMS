import { describe, expect, it } from 'vitest'
import { displayYmd, formatDateTime } from '../lib/dateFormat'

describe('formatDateTime', () => {
  const d = new Date(2026, 8, 3, 9, 5, 7) // local time

  it('formats as YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(d)).toBe('2026-09-03 09:05')
    expect(formatDateTime(d.toISOString())).toBe('2026-09-03 09:05')
  })
  it('keeps seconds when asked (audit log)', () => {
    expect(formatDateTime(d, { seconds: true })).toBe('2026-09-03 09:05:07')
  })
  it('uses 24-hour time', () => {
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31 23:59')
  })
  it('returns empty string for empty or invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('nope')).toBe('')
  })
})

describe('displayYmd', () => {
  it('turns the stored slash format into dashes', () => {
    expect(displayYmd('2026/09/29')).toBe('2026-09-29')
  })
  it('zero-pads unpadded stored values', () => {
    expect(displayYmd('2026/9/3')).toBe('2026-09-03')
  })
  it('does not shift the day through timezone parsing', () => {
    expect(displayYmd('2026/01/01')).toBe('2026-01-01')
  })
  it('returns empty for empty and leaves unknown shapes untouched', () => {
    expect(displayYmd('')).toBe('')
    expect(displayYmd(null)).toBe('')
    expect(displayYmd('TBD')).toBe('TBD')
  })
})
