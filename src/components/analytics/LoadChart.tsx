import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Schedule } from '../../types'

// ★ 工作類別色盤（與 TrendChart 一致）
const BAR_COLORS = [
  '#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#E11D48',
]

interface Props {
  schedules: Schedule[]
  categories: string[]
  showTitle?: boolean
}

const LoadChart: React.FC<Props> = ({ schedules, categories, showTitle = true }) => {
  // 實際出現的類別
  const activeCats = useMemo(() => {
    if (categories.length > 0) return categories
    return Array.from(new Set(schedules.map(s => s.category))).sort()
  }, [schedules, categories])

  // 依「測試人員 / 測試單位」× 工作類別 彙整
  const data = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}

    schedules.forEach(s => {
      const key = s.testEngineer || s.testUnit || '未分配'
      if (!map[key]) {
        map[key] = {}
        activeCats.forEach(c => { map[key][c] = 0 })
      }
      if (map[key][s.category] !== undefined) {
        map[key][s.category] += 1
      }
    })

    return Object.entries(map)
      .map(([name, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        return { name, ...counts, _total: total }
      })
      .sort((a, b) => b._total - a._total)
  }, [schedules, activeCats])

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-400 h-48">
        尚無資料
      </div>
    )
  }

  // ★ 動態計算圖表高度：每人 × 每類別各一條 bar
  //   每條 bar 高度約 18px，同一人的 bar 之間間距 2px，人與人之間間距 16px
  const barSize    = 18
  const barGap     = 2
  const groupGap   = 16
  const catCount   = activeCats.length
  const rowHeight  = catCount * barSize + (catCount - 1) * barGap + groupGap
  const chartHeight = Math.max(280, data.length * rowHeight + 40)

  // ★ 可視區域最大高度，超出則出現垂直 scrollbar
  const MAX_VISIBLE = 420

  return (
    <div>
      {showTitle && (
        <h3 className="text-lg font-semibold text-gray-700 mb-4">📦 負載分布（依工作類別）</h3>
      )}

      {/* ★ 外層：固定最大高度 + 垂直 scrollbar */}
      <div
        style={{
          maxHeight: MAX_VISIBLE,
          overflowY: chartHeight > MAX_VISIBLE ? 'auto' : 'hidden',
          overflowX: 'hidden',
        }}
      >
        {/* ★ 內層：實際圖表高度（可能超過可視區） */}
        <div style={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              barSize={barSize}
              barGap={barGap}
              barCategoryGap={groupGap}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 12 }}
                width={80}
              />
              <Tooltip />
              <Legend
                wrapperStyle={{
                  position: 'sticky',
                  bottom: 0,
                }}
              />
              {/* ★ 不加 stackId → 每個類別各自一條 bar，分開顯示 */}
              {activeCats.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  fill={BAR_COLORS[i % BAR_COLORS.length]}
                  radius={[0, 3, 3, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default LoadChart