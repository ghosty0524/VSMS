import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { SegmentedControl } from '../shared/SegmentedControl'
import { useOptionsStore } from '../../store/optionsStore'
import { allocateTimeResource, periodKey } from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { Schedule } from '../../types'

type Dimension = 'engineer' | 'unit'

interface Props {
  schedules: Schedule[]
  categories: string[]
  colorOf: (cat: string) => string
}

const LoadSection: React.FC<Props> = ({ schedules, categories, colorOf }) => {
  const { options } = useOptionsStore()
  const [scale, setScale] = useState<TimeScale>('month')
  const [period, setPeriod] = useState(() => periodKey(new Date(), 'month'))
  const [dim, setDim] = useState<Dimension>('engineer')

  const active = useMemo(() => schedules.filter(s => !s.isCancelled), [schedules])

  // 每筆排程的期間分攤（scale 變更時重算）
  const allocations = useMemo(
    () => active.map(s => ({ s, alloc: allocateTimeResource(s, scale, options.restDays) })),
    [active, scale, options.restDays]
  )

  const periodOptions = useMemo(() => {
    const keys = new Set<string>([periodKey(new Date(), scale)])
    allocations.forEach(({ alloc }) => Object.keys(alloc).forEach(k => keys.add(k)))
    return Array.from(keys).sort()
  }, [allocations, scale])

  const changeScale = (v: TimeScale) => {
    setScale(v)
    setPeriod(periodKey(new Date(), v))
  }

  const data = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    allocations.forEach(({ s, alloc }) => {
      const days = alloc[period] ?? 0
      if (days <= 0) return
      const key = (dim === 'engineer' ? s.testEngineer : s.testUnit) || '未分配'
      if (!map[key]) map[key] = {}
      map[key][s.category] = (map[key][s.category] ?? 0) + days
    })
    return Object.entries(map)
      .map(([name, counts]) => ({
        name, ...counts,
        _total: Object.values(counts).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b._total - a._total)
  }, [allocations, period, dim])

  const chartHeight = Math.max(200, data.length * 32 + 60)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">負載分布（工作天）</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ScaleToggle value={scale} onChange={changeScale} />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none">
            {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <SegmentedControl
            ariaLabel="負載分組維度"
            value={dim}
            onChange={setDim}
            options={[
              { value: 'engineer', label: '人員' },
              { value: 'unit',     label: '單位' },
            ]}
          />
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">此期間尚無負載資料</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
              <Tooltip formatter={(value: number | string, name: string) => [`${Number(value).toFixed(1)} 天`, name]} />
              {categories.map(cat => (
                <Bar key={cat} dataKey={cat} stackId="load" fill={colorOf(cat)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400">
            跨期排程依重疊工作天比例分攤 timeResource；已取消排程不計入
          </p>
        </>
      )}
    </div>
  )
}

export default LoadSection
