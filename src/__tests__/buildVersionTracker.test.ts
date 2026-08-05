// src/__tests__/buildVersionTracker.test.ts
// 純狀態機邏輯：不牽涉 fetch/timer/DOM，直接餵值驗證判斷結果。
import { describe, it, expect } from 'vitest'
import { createBuildVersionTracker } from '../lib/buildVersionTracker'

describe('createBuildVersionTracker', () => {
  it('第一次觀察只記錄，不判定為 stale', () => {
    const tracker = createBuildVersionTracker()
    expect(tracker.observe(100)).toBe(false)
    expect(tracker.isStale()).toBe(false)
  })

  it('後續觀察到相同的值時不是 stale', () => {
    const tracker = createBuildVersionTracker()
    tracker.observe(100)
    expect(tracker.observe(100)).toBe(false)
    expect(tracker.isStale()).toBe(false)
  })

  it('觀察到不同的值時判定為 stale', () => {
    const tracker = createBuildVersionTracker()
    tracker.observe(100)
    expect(tracker.observe(200)).toBe(true)
    expect(tracker.isStale()).toBe(true)
  })

  it('失敗的檢查（null）不會標記 stale，也不會覆寫已記錄的值', () => {
    const tracker = createBuildVersionTracker()
    tracker.observe(100)
    expect(tracker.observe(null)).toBe(false)
    expect(tracker.isStale()).toBe(false)
    // 記錄值仍是 100：之後回報 100 應仍視為未變
    expect(tracker.observe(100)).toBe(false)
    expect(tracker.isStale()).toBe(false)
  })

  it('第一次觀察就是 null 時，之後第一個有效值才開始被記錄（不是 stale）', () => {
    const tracker = createBuildVersionTracker()
    expect(tracker.observe(null)).toBe(false)
    expect(tracker.observe(100)).toBe(false)
    expect(tracker.isStale()).toBe(false)
  })

  it('一旦 stale，之後即使觀察到又變回原值也維持 stale', () => {
    const tracker = createBuildVersionTracker()
    tracker.observe(100)
    tracker.observe(200)
    expect(tracker.isStale()).toBe(true)
    expect(tracker.observe(100)).toBe(true)
    expect(tracker.isStale()).toBe(true)
  })
})
