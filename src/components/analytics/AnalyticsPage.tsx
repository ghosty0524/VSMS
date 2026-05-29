import React, { useState, useMemo } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { computeStatus } from '../../lib/status'
import KpiCards from './KpiCards'
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

const STATUS_OPTIONS = ['Completed', 'Testing', 'Planned', 'Delayed']

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

// 篩選列元件
interface FilterBarProps {
  filter: AnalyticsFilter
  onChange: (f: AnalyticsFilter) => void
  categoryOptions: string[]
  unitOptions: string[]
  engineerOptions: string[]
  showStatusFilter?: boolean
}

function FilterBar({
  filter, onChange,
  categoryOptions, unitOptions, engineerOptions,
  showStatusFilter = false,
}: FilterBarProps) {
  const hasFilter = !isFilterEmpty(filter)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">🔍 篩選：</span>
      <MultiSelect
        label="工作類別"
        options={categoryOptions}
        selected={filter.categories}
        onChange={v => onChange({ ...filter, categories: v })}
      />
      <MultiSelect
        label="測試單位"
        options={unitOptions}
        selected={filter.testUnits}
        onChange={v => onChange({ ...filter, testUnits: v })}
      />
      <MultiSelect
        label="測試人員"
        options={engineerOptions}
        selected={filter.testEngineers}
        onChange={v => onChange({ ...filter, testEngineers: v })}
      />
      {showStatusFilter && (
        <MultiSelect
          label="排程狀態"
          options={STATUS_OPTIONS}
          selected={filter.statuses}
          onChange={v => onChange({ ...filter, statuses: v })}
        />
      )}
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange(emptyFilter)}
          className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
        >
          ✕ 重置
        </button>
      )}
    </div>
  )
}

const AnalyticsPage: React.FC = () => {
  const schedules = useScheduleStore(s => s.schedules)
  const { options } = useOptionsStore()

  const [globalFilter, setGlobalFilter] = useState<AnalyticsFilter>(emptyFilter)
  const [loadFilter, setLoadFilter] = useState<AnalyticsFilter>(emptyFilter)
  const [expiringFilter, setExpiringFilter] = useState<AnalyticsFilter>(emptyFilter)

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

  function applyFilter(filter: AnalyticsFilter) {
    return schedules.filter(s => {
      if (filter.categories.length > 0 && !filter.categories.includes(s.category)) return false
      if (filter.testUnits.length > 0 && !filter.testUnits.includes(s.testUnit)) return false
      if (filter.testEngineers.length > 0 && !filter.testEngineers.includes(s.testEngineer)) return false
      if (filter.statuses.length > 0 && !filter.statuses.includes(computeStatus(s))) return false
      return true
    })
  }

  const globalSchedules   = useMemo(() => applyFilter(globalFilter),   [schedules, globalFilter])
  const loadSchedules     = useMemo(() => applyFilter(loadFilter),     [schedules, loadFilter])
  const expiringSchedules = useMemo(() => applyFilter(expiringFilter), [schedules, expiringFilter])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">📊 統計分析</h2>
      </div>

      {/* KPI 卡片 + 篩選 */}
      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-semibold text-gray-700">📈 整體概覽</h3>
          <FilterBar
            filter={globalFilter}
            onChange={setGlobalFilter}
            categoryOptions={categoryOptions}
            unitOptions={unitOptions}
            engineerOptions={engineerOptions}
            showStatusFilter
          />
        </div>
        <KpiCards schedules={globalSchedules} />
      </div>

      {/* 趨勢圖 */}
      <TrendChart schedules={globalSchedules} categories={categoryOptions} />

      {/* ★ 負載分布 + 獨立篩選（加上排程狀態篩選） */}
      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-semibold text-gray-700">📦 負載分布</h3>
          <FilterBar
            filter={loadFilter}
            onChange={setLoadFilter}
            categoryOptions={categoryOptions}
            unitOptions={unitOptions}
            engineerOptions={engineerOptions}
            showStatusFilter       /* ★ 新增：負載篩選也顯示排程狀態 */
          />
        </div>
        {/* ★ 新增：傳入 categories */}
        <LoadChart schedules={loadSchedules} categories={categoryOptions} showTitle={false} />
      </div>

      {/* 即將到期 + 獨立篩選 */}
      <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-semibold text-gray-700">⏰ 即將到期清單</h3>
          <FilterBar
            filter={expiringFilter}
            onChange={setExpiringFilter}
            categoryOptions={categoryOptions}
            unitOptions={unitOptions}
            engineerOptions={engineerOptions}
          />
        </div>
        <ExpiringList schedules={expiringSchedules} showTitle={false} />
      </div>
    </div>
  )
}

export default AnalyticsPage