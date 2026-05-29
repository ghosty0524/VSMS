import { describe, it, expect } from 'vitest'
import { getTooltipPosition } from '../components/schedule/GanttChart'

const TOOLTIP_ESTIMATE_W = 220
const TOOLTIP_ESTIMATE_H = 180
const TOOLTIP_OFFSET     = 14

describe('getTooltipPosition', () => {
  const VW = 1280
  const VH = 800

  it('正常位置（右下偏移）', () => {
    const pos = getTooltipPosition(400, 300, VW, VH)
    expect(pos.left).toBe(400 + TOOLTIP_OFFSET)
    expect(pos.top).toBe(300 + TOOLTIP_OFFSET)
  })

  it('靠近右側邊框 → 向左彈出', () => {
    const pos = getTooltipPosition(1200, 300, VW, VH)
    expect(pos.left).toBe(1200 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W)
    expect(pos.top).toBe(300 + TOOLTIP_OFFSET)
  })

  it('靠近底部邊框 → 向上彈出', () => {
    const pos = getTooltipPosition(400, 700, VW, VH)
    expect(pos.left).toBe(400 + TOOLTIP_OFFSET)
    expect(pos.top).toBe(700 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H)
  })

  it('右下角落 → 左上彈出', () => {
    const pos = getTooltipPosition(1200, 700, VW, VH)
    expect(pos.left).toBe(1200 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W)
    expect(pos.top).toBe(700 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H)
  })

  it('邊界值：x + OFFSET + W === viewportW → 正常（不翻轉）', () => {
    // 1046 + 14 + 220 = 1280 = VW → 不翻轉
    const pos = getTooltipPosition(1046, 300, VW, VH)
    expect(pos.left).toBe(1046 + TOOLTIP_OFFSET)
  })

  it('邊界值：x + OFFSET + W > viewportW → 翻轉', () => {
    // 1047 + 14 + 220 = 1281 > 1280 → 翻轉
    const pos = getTooltipPosition(1047, 300, VW, VH)
    expect(pos.left).toBe(1047 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W)
  })

  it('Y 軸邊界值：y + OFFSET + H === viewportH → 正常（不翻轉）', () => {
    // 606 + 14 + 180 = 800 = VH → 不翻轉
    const pos = getTooltipPosition(400, 606, VW, VH)
    expect(pos.top).toBe(606 + TOOLTIP_OFFSET)
  })

  it('Y 軸邊界值：y + OFFSET + H > viewportH → 翻轉', () => {
    // 607 + 14 + 180 = 801 > 800 → 翻轉
    const pos = getTooltipPosition(400, 607, VW, VH)
    expect(pos.top).toBe(607 - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H)
  })
})
