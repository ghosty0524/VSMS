// src/components/schedule/GanttBar.tsx
// 甘特圖的單根 bar：外框編碼測試單位、內裡編碼工程師。
// 工程師視角與設備視角共用此元件，幾何計算只寫一次以免兩者走樣。
import type React from 'react'
import { OVERFLOW_COLOR } from '../../constants'
import { readableTextColor } from '../../lib/colors'

const BAR_H = 22
const STROKE_W = 2
const OVERFLOW_INSET = 3

interface Props {
  barX: number
  barW: number
  barY: number
  unitColor: string
  engColor: string
  /** 溢出段的起始 x；null 表示未溢出 */
  overflowStartX: number | null
  /** 顯示於 bar 上的人名；null 表示不顯示 */
  label: string | null
  clipId: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export default function GanttBar({
  barX, barW, barY, unitColor, engColor, overflowStartX, label, clipId,
  onMouseEnter, onMouseLeave,
}: Props) {
  const innerW = Math.max(barW - STROKE_W, 4)
  return (
    <>
      {/* 一整根帶框的 bar。描邊置中於邊界，故內縮 1px 使總高仍為 BAR_H。 */}
      <rect
        x={barX + STROKE_W / 2} y={barY + STROKE_W / 2}
        width={innerW} height={BAR_H - STROKE_W}
        fill={engColor} stroke={unitColor} strokeWidth={STROKE_W} rx={4}
        style={{ cursor: 'pointer', opacity: 0.92 }}
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />

      {/* 溢出段疊在框內且不描邊，外框才會保持連續。
          pointerEvents none 讓 hover 事件交由底下的外框處理。 */}
      {overflowStartX !== null && (
        <rect
          x={overflowStartX}
          y={barY + OVERFLOW_INSET}
          width={Math.max(barX + barW - overflowStartX - OVERFLOW_INSET, OVERFLOW_INSET)}
          height={BAR_H - OVERFLOW_INSET * 2}
          rx={3} fill={OVERFLOW_COLOR}
          style={{ pointerEvents: 'none' }} />
      )}

      {label !== null && barW > 24 && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x={barX + 4} y={barY} width={barW - 8} height={BAR_H} />
            </clipPath>
          </defs>
          <text x={barX + 6} y={barY + 15} fontSize={12}
            fill={readableTextColor(engColor)} fontWeight="600"
            clipPath={`url(#${clipId})`}
            style={{ pointerEvents: 'none' }}>
            {label}
          </text>
        </>
      )}
    </>
  )
}
