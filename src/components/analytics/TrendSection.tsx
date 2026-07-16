import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { periodKey, parseYmd } from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { Schedule } from '../../types'

interface Props {
  schedules: Schedule[]
  categories: string[]
  colorOf: (cat: string) => string
}

const TrendSection: React.FC<Props> = ({ schedules, categories, colorOf }) => {
  const [scale, setScale] = useState<TimeScale>('month')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [piePeriod, setPiePeriod] = useState('全部')

  const visibleCats = useMemo(() => categories.filter(c => !hidden.has(c)), [categories, hidden])

  const toggleCat = (cat: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // 各排程依起始日歸屬期間
  const withPeriod = useMemo(
    () => schedules.map(s => ({ s, period: periodKey(parseYmd(s.startDate), scale) })),
    [schedules, scale]
  )

  const periodOptions = useMemo(
    () => ['全部', ...Array.from(new Set(withPeriod.map(x => x.period))).sort()],
    [withPeriod]
  )

  // 折線：每期間 × 類別 筆數
  const trendData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    withPeriod.forEach(({ s, period }) => {
      if (!map[period]) {
        map[period] = {}
        visibleCats.forEach(c => { map[period][c] = 0 })
      }
      if (map[period][s.category] !== undefined) map[period][s.category] += 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, counts]) => ({ period, ...counts }))
  }, [withPeriod, visibleCats])

  // 圓餅：選定期間內各類別占比
  const pieData = useMemo(() => {
    const rows = withPeriod.filter(x => piePeriod === '全部' || x.period === piePeriod)
    return visibleCats
      .map(cat => ({ name: cat, value: rows.filter(x => x.s.category === cat).length }))
      .filter(d => d.value > 0)
  }, [withPeriod, visibleCats, piePeriod])

  const pieTotal = pieData.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">類別趨勢與占比</h3>
        <ScaleToggle value={scale} onChange={v => { setScale(v); setPiePeriod('全部') }} />
      </div>

      {/* 類別 chips：點擊即時顯示/隱藏，同時作用於折線與圓餅 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {categories.map(cat => {
          const off = hidden.has(cat)
          return (
            <button key={cat} type="button" onClick={() => toggleCat(cat)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                off ? 'border-gray-200 text-gray-400 line-through' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}>
              {!off && <span className="w-2 h-2 rounded-full" style={{ background: colorOf(cat) }} />}
              {cat}
            </button>
          )
        })}
        <span className="text-[11px] text-gray-400">點擊切換顯示類別</span>
      </div>

      {schedules.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-48 text-sm">尚無資料</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 min-w-0">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                {visibleCats.map(cat => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={colorOf(cat)}
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-400 mt-1">每期間新增排程數（依起始日期歸屬）</p>
          </div>

          <div className="min-w-0 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {pieData.map(d => <Cell key={d.name} fill={colorOf(d.name)} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 -mt-2">類別占比（共 {pieTotal} 筆）</p>
            <select value={piePeriod} onChange={e => setPiePeriod(e.target.value)}
              className="mt-2 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none">
              {periodOptions.map(p => <option key={p} value={p}>{p === '全部' ? '期間：全部' : `期間：${p}`}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default TrendSection
