// src/components/schedule/GanttBar.tsx
// 甘特圖的單根 bar：外框編碼測試單位、內裡編碼工程師。
// 工程師視角與設備視角共用此元件，幾何計算只寫一次以免兩者走樣。
import type React from 'react'
import { OVERFLOW_COLOR } from '../../constants'
import { readableTextColor } from '../../lib/colors'
import type { ScheduleStatus } from '../../lib/status'

export const BAR_H = 22
const STROKE_W = 2
const OVERFLOW_INSET = 3

/* ────────────────────────────────────────────────────────────────
   狀態的形式編碼

   顏色在這張圖上已經沒有空位 —— 外框是測試單位、內裡是工程師、
   溢出段是綠色。再用顏色表示狀態，就會跟資料本身的顏色打架。
   所以狀態一律走非顏色通道：填色不透明度、外框虛線、刪除線。
   這些通道對色弱使用者同樣有效，與 STATUS_GLYPH 的用意一致。

   Planned 與 Testing 刻意不做區隔 —— 兩者的分界就是「起始日是否
   已過」，而今日線就畫在圖上，bar 落在線的哪一側已經把這件事說完了。
   再加淡色或進度線是重複的墨水；而且預設檢視 161 筆裡有 137 筆是
   Planned，把 85% 的 bar 調淡等於把整張圖調淡，訊號反而不見了。

   真正沒被編碼的是「結束了沒有」：篩選條件放寬之後，已完成的 bar
   跟進行中的 bar 長得一模一樣。下面編的就是這件事。

   沒有另外做圖例，是因為工程師視角的左欄每一列都有狀態籤（含 STATUS_GLYPH
   的符號與英文字），等於圖例就長在每一列旁邊，再加一排說明只會把工具列的
   高度加回去。設備視角的左欄是設備名稱、沒有狀態籤，那裡的狀態改由 tooltip
   的狀態籤補上。
   ──────────────────────────────────────────────────────────────── */
interface BarForm {
  /** 內裡不透明度 —— 已結案的往下降，讓 bar 看起來被掏空 */
  fillOpacity: number
  /** 外框不透明度 —— 內裡再淡，外框仍維持滿色，bar 才不會整根消失。
      工程師色有淺有深，若整根一起降透明度，淺色那幾位會在近白底上看不見。 */
  strokeOpacity: number
  /** 外框虛線 —— 只給被標記 Delayed 的排程 */
  strokeDash?: string
  /** 中線刪除線 —— 只給 Cancelled */
  strike?: boolean
}

const BAR_FORM: Record<ScheduleStatus, BarForm> = {
  Planned:   { fillOpacity: 0.92, strokeOpacity: 1 },
  Testing:   { fillOpacity: 0.92, strokeOpacity: 1 },
  Delayed:   { fillOpacity: 0.92, strokeOpacity: 1, strokeDash: '4 2.5' },
  Completed: { fillOpacity: 0.32, strokeOpacity: 1 },
  Cancelled: { fillOpacity: 0.15, strokeOpacity: 0.55, strike: true },
}

/* ── 逾期尾巴 ────────────────────────────────────────────────────
   逾期（已過完成日、仍未結案）與延遲（有人勾了 isDelayed）是兩件事，
   後端在 integration.ts 是刻意分開回報給 Agent 的，這裡不能把它們畫成
   同一個東西。

   所以兩者走不同通道：
     逾期 → 一段有長度的尾巴，從 bar 的右緣量到今日線
     延遲 → 外框虛線，沒有長度

   兩者可以同時出現，畫面上也讀得出是兩件事。尾巴用今日線的紅色而不是
   Delayed 徽章的紅，因為它量的正是「到今日為止」，跟那條線是一組的。
   ──────────────────────────────────────────────────────────────── */
// 尾巴的長度與 tooltip 的「逾期 N 天」會差一天，這是刻意的，不是 off-by-one：
// 尾巴從完成日欄位的右緣量到今日線，蓋住的是「已經整天過去」的那幾天；
// tooltip 的天數把今天也算進去（8/27 到期、9/3 就是逾期 7 天）。
// 讓尾巴跨過今日線才能對上 7 格，但那等於宣稱今天已經過完了。
// 今日線是這張圖的「現在」基準，不讓任何東西越過它；確切天數由 tooltip 負責。
export const OVERDUE_PATTERN_ID = 'gantt-overdue-hatch'
const OVERDUE_INSET = 4
/** 尾巴上限（14 天）。放著沒結案好幾個月的舊資料不該把整列佔滿，
    確切天數由 tooltip 補上。 */
const MAX_OVERDUE_W = 14 * 22

/** 斜紋定義。整張 SVG 只需要一份，掛在最外層的 <defs>，
    不要跟著每根 bar 重複產生。 */
export function OverdueHatchPattern() {
  return (
    <pattern id={OVERDUE_PATTERN_ID} width={6} height={6}
      patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={6} height={6} className="g-overdue-fill" fillOpacity={0.08} />
      <line x1={0} y1={0} x2={0} y2={6} className="g-overdue-line" strokeWidth={2} strokeOpacity={0.42} />
    </pattern>
  )
}

interface Props {
  barX: number
  barW: number
  barY: number
  unitColor: string
  engColor: string
  /** 溢出段的起始 x；null 表示未溢出 */
  overflowStartX: number | null
  /** 排程狀態，決定 bar 的形式 */
  status: ScheduleStatus
  /** 逾期尾巴要畫到的 x（今日線）；null 表示未逾期或今日不在時間軸內 */
  overdueToX: number | null
  /** 顯示於 bar 上的人名；null 表示不顯示 */
  label: string | null
  clipId: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export default function GanttBar({
  barX, barW, barY, unitColor, engColor, overflowStartX, status, overdueToX,
  label, clipId, onMouseEnter, onMouseLeave,
}: Props) {
  const innerW = Math.max(barW - STROKE_W, 4)
  const form = BAR_FORM[status]

  const tailX = barX + barW
  const tailW = overdueToX === null
    ? 0
    : Math.min(Math.max(overdueToX - tailX, 0), MAX_OVERDUE_W)

  return (
    <>
      {/* 逾期尾巴畫在 bar 之前，bar 的圓角右緣才會壓在上面。
          pointerEvents none —— hover 一律交給 bar 本體處理。 */}
      {tailW > 0 && (
        <rect
          x={tailX} y={barY + OVERDUE_INSET}
          width={tailW} height={BAR_H - OVERDUE_INSET * 2}
          rx={2}
          fill={`url(#${OVERDUE_PATTERN_ID})`}
          className="g-overdue-line" strokeWidth={1} strokeOpacity={0.35}
          style={{ pointerEvents: 'none' }} />
      )}

      {/* 一整根帶框的 bar。描邊置中於邊界，故內縮 1px 使總高仍為 BAR_H。 */}
      <rect
        x={barX + STROKE_W / 2} y={barY + STROKE_W / 2}
        width={innerW} height={BAR_H - STROKE_W}
        fill={engColor} fillOpacity={form.fillOpacity}
        stroke={unitColor} strokeWidth={STROKE_W} strokeOpacity={form.strokeOpacity}
        strokeDasharray={form.strokeDash}
        rx={4}
        style={{ cursor: 'pointer' }}
        onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />

      {/* 溢出段疊在框內且不描邊，外框才會保持連續。
          跟著 bar 一起淡化，否則已完成排程會只剩一截綠色浮在空框裡。 */}
      {overflowStartX !== null && (
        <rect
          x={overflowStartX}
          y={barY + OVERFLOW_INSET}
          width={Math.max(barX + barW - overflowStartX - OVERFLOW_INSET, OVERFLOW_INSET)}
          height={BAR_H - OVERFLOW_INSET * 2}
          rx={3} fill={OVERFLOW_COLOR} fillOpacity={form.fillOpacity}
          style={{ pointerEvents: 'none' }} />
      )}

      {/* 取消：中線劃掉。淡化只說得出「不是現在的事」，
          劃掉才說得出「這件事不做了」。 */}
      {form.strike && (
        <line
          x1={barX + 3} y1={barY + BAR_H / 2}
          x2={barX + barW - 3} y2={barY + BAR_H / 2}
          className="g-strike" strokeWidth={1.5} strokeOpacity={0.75}
          style={{ pointerEvents: 'none' }} />
      )}

      {label !== null && barW > 24 && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x={barX + 4} y={barY} width={barW - 8} height={BAR_H} />
            </clipPath>
          </defs>
          {/* 內裡淡化之後，bar 的實際亮度已經不是 engColor 了 ——
              深色工程師色配白字，降到 0.32 就變成白字浮在淺底上。
              淡化的一律用深字。 */}
          <text x={barX + 6} y={barY + 15} fontSize={12}
            fontWeight="600"
            clipPath={`url(#${clipId})`}
            style={{
              pointerEvents: 'none',
              fill: form.fillOpacity < 0.5 ? 'var(--gantt-bar-dim-text)' : readableTextColor(engColor),
            }}>
            {label}
          </text>
        </>
      )}
    </>
  )
}
