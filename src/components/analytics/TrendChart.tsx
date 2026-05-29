import React, { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Schedule } from '../../types'

// ★ 工作類別色盤（最多 12 色循環）
const LINE_COLORS = [
  '#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#E11D48',
]

interface Props {
  schedules: Schedule[]
  categories: string[]   // ★ 新增：由 AnalyticsPage 傳入
}

function getMonthKey(dateStr: string): string {
  const d = dateStr.includes('/') ? (() => {
    const [y, m] = dateStr.split('/').map(Number)
    return new Date(y, m - 1, 1)
  })() : new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TrendChart: React.FC<Props> = ({ schedules, categories }) => {
  // ★ 實際出現的類別（優先用傳入的 categories，否則從資料推導）
  const activeCats = useMemo(() => {
    if (categories.length > 0) return categories
    return Array.from(new Set(schedules.map(s => s.category))).sort()
  }, [schedules, categories])

  // ★ 依「起始日期」月份 × 工作類別 彙整資料
  const data = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}

    schedules.forEach(s => {
      const key = getMonthKey(s.startDate)
      if (!key) return

      if (!map[key]) {
        map[key] = {}
        activeCats.forEach(c => { map[key][c] = 0 })
      }
      // 該類別在該月份 +1
      if (map[key][s.category] !== undefined) {
        map[key][s.category] += 1
      }
    })

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({ month, ...counts }))
  }, [schedules, activeCats])

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-6 flex items-center justify-center text-gray-400 h-64">
        尚無資料
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">📈 排程趨勢（依工作類別）</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {/* ★ 動態產生每個工作類別的線條 */}
          {activeCats.map((cat, i) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default TrendChart