import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { SegmentedControl } from '../shared/SegmentedControl'
import { api, ApiError } from '../../lib/api'
import {
  periodKey, periodRange, periodKeysOfSchedules, aggregateByUnit, LEVEL_COLORS, LEVEL_ORDER,
} from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { AnalyticsFilter } from './AnalyticsPage'
import type { Schedule, WorkloadResponse, WorkloadLevel } from '../../types'

type Dimension = 'engineer' | 'unit'

interface Props {
  // 類別／單位／人員篩選會送給 API；狀態篩選刻意不送——Agent 算法只排除已取消、不看狀態
  filter: AnalyticsFilter
  // 只用來推出期間下拉的選項，不參與計算
  schedules: Schedule[]
}

interface Row {
  name: string
  rate: number
  level: WorkloadLevel
  baseScore?: number
  scheduleCount: number
  cappedDays?: number
  unscheduledDays?: number
  headcount?: number
}

const LoadSection: React.FC<Props> = ({ filter, schedules }) => {
  const [scale, setScale] = useState<TimeScale>('month')
  const [period, setPeriod] = useState(() => periodKey(new Date(), 'month'))
  const [dim, setDim] = useState<Dimension>('engineer')
  // 結果與錯誤都綁著「是哪一組查詢條件」的鍵：載入中＝目前條件還沒有對應的結果，
  // 由 render 推導而不另存 loading 旗標，effect 內就不需要同步 setState；
  // 篩選連續變更時較早送出的請求即使較晚回來，鍵對不上也會被忽略。
  const [result, setResult] = useState<{ key: string; data: WorkloadResponse } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const latestKey = useRef('')

  const periodOptions = useMemo(
    () => periodKeysOfSchedules(schedules, scale, new Date()),
    [schedules, scale],
  )

  const changeScale = (v: TimeScale) => {
    setScale(v)
    setPeriod(periodKey(new Date(), v))
  }

  const { categories, testUnits, testEngineers } = filter
  const requestKey = useMemo(
    () => JSON.stringify({ period, scale, categories, testUnits, testEngineers }),
    [period, scale, categories, testUnits, testEngineers],
  )
  useEffect(() => {
    const key = requestKey
    latestKey.current = key
    const { from, to } = periodRange(period, scale)
    api.getWorkload({ from, to, categories, testUnits, testEngineers })
      .then(r => { if (key === latestKey.current) setResult({ key, data: r }) })
      .catch(e => {
        if (key !== latestKey.current) return
        setError({ key, message: e instanceof ApiError ? e.message : '無法取得負載資料' })
      })
  }, [requestKey, period, scale, categories, testUnits, testEngineers])

  const currentError = error?.key === requestKey ? error.message : null
  const loading = !currentError && result?.key !== requestKey

  const data: Row[] = useMemo(() => {
    if (!result) return []
    const engineers = result.data.engineers
    if (dim === 'unit') {
      return aggregateByUnit(engineers).map(u => ({
        name: u.name, rate: u.rate, level: u.level, scheduleCount: u.scheduleCount, headcount: u.headcount,
      }))
    }
    return engineers.map(e => ({
      name: e.testEngineer, rate: e.rate, level: e.level, baseScore: e.baseScore,
      scheduleCount: e.scheduleCount, cappedDays: e.cappedDays, unscheduledDays: e.unscheduledDays,
    }))
  }, [result, dim])

  const chartHeight = Math.max(200, data.length * 32 + 60)
  const workdays = result?.data.workdays ?? 0
  const notes = result?.data.notes ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">負載分布（負載率％）</h3>
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

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
        {LEVEL_ORDER.map(level => (
          <span key={level} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: LEVEL_COLORS[level] }} />
            {level}
          </span>
        ))}
        {workdays > 0 && <span>期間工作日 {workdays} 天</span>}
      </div>

      {currentError ? (
        <div className="flex items-center justify-center text-red-500 h-40 text-sm">{currentError}</div>
      ) : loading && !result ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">載入中…</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">此期間尚無負載資料</div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
              <ReferenceLine x={100} stroke="#dc2626" strokeDasharray="4 4" />
              <Tooltip content={<LoadTooltip dim={dim} workdays={workdays} />} />
              <Bar dataKey="rate" isAnimationActive={false}>
                {data.map(d => <Cell key={d.name} fill={LEVEL_COLORS[d.level]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="text-[11px] text-amber-600 space-y-0.5">
          {notes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="text-[11px] text-gray-400">
        與 Agent 負載分析同一算法（不含加班加分）：每日強度＝(timeResource＋類別調整)÷區間工作日，單日 1.2 封頂；
        工作日依政府行事曆；已取消排程不計；狀態篩選不影響此圖。
        {dim === 'unit' && ' 單位負載率＝該期間有排程的所屬人員平均。'}
      </p>
    </div>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: Row }[]
  dim: Dimension
  workdays: number
}

const LoadTooltip: React.FC<TooltipProps> = ({ active, payload, dim, workdays }) => {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs text-gray-700 space-y-0.5">
      <div className="font-semibold">{row.name}</div>
      <div>負載率 {row.rate.toFixed(1)}%（{row.level}）</div>
      {dim === 'engineer' ? (
        <>
          <div>基礎分 {row.baseScore?.toFixed(2)}／期間工作日 {workdays} 天</div>
          <div>排程 {row.scheduleCount} 筆</div>
          <div>封頂 {row.cappedDays} 天、未排程 {row.unscheduledDays} 天</div>
        </>
      ) : (
        <>
          <div>人數 {row.headcount} 人</div>
          <div>排程 {row.scheduleCount} 筆</div>
        </>
      )}
    </div>
  )
}

export default LoadSection
