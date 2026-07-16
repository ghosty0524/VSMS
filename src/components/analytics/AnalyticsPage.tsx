import React, { useState, useMemo } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { computeStatus } from '../../lib/status'
import { CATEGORY_COLORS } from '../../constants'
import KpiSection from './KpiSection'
import TrendChart from './TrendChart'
import LoadChart from './LoadChart'
import ExpiringList from './ExpiringList'

export interface AnalyticsFilter {
  categories: string[]
  testUnits: string[]
  testEngineers: string[]
  statuses: string[]
}

const emptyFilter: AnalyticsFilter = {
  categories: [],
  testUnits: [],
  testEngineers: [],
  statuses: [],
}

function isFilterEmpty(f: AnalyticsFilter): boolean {
  return (
    f.categories.length === 0 &&
    f.testUnits.length === 0 &&
    f.testEngineers.length === 0 &&
    f.statuses.length === 0
  )
}

const STATUS_OPTIONS = ['Planned', 'Testing', 'Completed', 'Delayed', 'Cancelled']

// 通用多選下拉元件
interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (val: string[]) => void
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const isAll = selected.length === 0

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter(x => x !== v))
    } else {
      onChange([...selected, v])
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-2.5 py-1 text-xs border rounded-lg flex items-center gap-1 transition-colors ${
          !isAll
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-300 hover:bg-gray-50 text-gray-600'
        }`}
      >
        {label}
        {!isAll && (
          <span className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
            {selected.length}
          </span>
        )}
        <span className="text-gray-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                isAll ? 'font-semibold text-blue-600' : 'text-gray-600'
              }`}
            >
              {isAll ? '✓ ' : '　'}全部
            </button>
            <div className="border-t border-gray-100 my-1" />
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <span className="w-3">{selected.includes(opt) ? '✓' : ''}</span>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const AnalyticsPage: React.FC = () => {
  const schedules = useScheduleStore(s => s.schedules)
  const { options } = useOptionsStore()
  const [filter, setFilter] = useState<AnalyticsFilter>(emptyFilter)

  const categoryOptions = useMemo(
    () => options.categories.filter(c => c.isActive).map(c => c.label).sort(),
    [options.categories]
  )
  const unitOptions = useMemo(
    () => options.testUnits.filter(u => u.isActive).map(u => u.label).sort(),
    [options.testUnits]
  )
  const engineerOptions = useMemo(
    () => options.testUnits
      .flatMap(u => u.engineers)
      .filter(e => e.isActive)
      .map(e => e.label)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort(),
    [options.testUnits]
  )

  // 顏色跟著類別走（啟用類別清單索引），篩選不重排
  const colorOf = useMemo(() => {
    const map = new Map(categoryOptions.map((c, i) => [c, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]))
    return (cat: string) => map.get(cat) ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1]
  }, [categoryOptions])
  // Task 13/14 使用
  void colorOf

  const filtered = useMemo(() => schedules.filter(s => {
    if (filter.categories.length > 0 && !filter.categories.includes(s.category)) return false
    if (filter.testUnits.length > 0 && !filter.testUnits.includes(s.testUnit)) return false
    if (filter.testEngineers.length > 0 && !filter.testEngineers.includes(s.testEngineer)) return false
    if (filter.statuses.length > 0 && !filter.statuses.includes(computeStatus(s))) return false
    return true
  }), [schedules, filter])

  const hasFilter = !isFilterEmpty(filter)

  return (
    <div>
      {/* 全域篩選列：sticky 固定，捲動不消失 */}
      <div className="sticky top-0 z-30 bg-gray-100/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 mr-2">統計分析</h2>
          <span className="text-xs text-gray-500">篩選</span>
          <MultiSelect label="工作類別" options={categoryOptions}
            selected={filter.categories} onChange={v => setFilter({ ...filter, categories: v })} />
          <MultiSelect label="測試單位" options={unitOptions}
            selected={filter.testUnits} onChange={v => setFilter({ ...filter, testUnits: v })} />
          <MultiSelect label="測試人員" options={engineerOptions}
            selected={filter.testEngineers} onChange={v => setFilter({ ...filter, testEngineers: v })} />
          <MultiSelect label="排程狀態" options={STATUS_OPTIONS}
            selected={filter.statuses} onChange={v => setFilter({ ...filter, statuses: v })} />
          {hasFilter && (
            <button type="button" onClick={() => setFilter(emptyFilter)}
              className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
              重置
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">整體概覽</h3>
          <KpiSection schedules={filtered} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5">
          <TrendChart schedules={filtered} categories={categoryOptions} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">負載分布</h3>
          <LoadChart schedules={filtered} categories={categoryOptions} showTitle={false} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">風險清單</h3>
          <ExpiringList schedules={filtered} showTitle={false} />
        </section>
      </div>
    </div>
  )
}

export default AnalyticsPage
