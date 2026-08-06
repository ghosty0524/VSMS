import React, { useState, useMemo } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { computeStatus } from '../../lib/status'
import { splitByStatsMode } from '../../lib/analytics'
import { buildFilterOptions, buildInactiveValueSet, buildOptionLabels, buildLabelByValue } from '../../lib/filterOptions'
import { CATEGORY_COLORS } from '../../constants'
import KpiSection from './KpiSection'
import TrendSection from './TrendSection'
import LoadSection from './LoadSection'
import RiskList from './RiskList'
import UnitComparison from './UnitComparison'
import DelayAnalysis from './DelayAnalysis'

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
  /** 選填：value → 顯示文字對照表（例如已停用項目加註「（已停用）」）。
   *  只影響顯示文字，比對／勾選／onChange 一律仍用原始 value。 */
  optionLabels?: Record<string, string>
}

function MultiSelect({ label, options, selected, onChange, optionLabels }: MultiSelectProps) {
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
                {optionLabels?.[opt] ?? opt}
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

  // ── 篩選下拉的選項清單 ──────────────────────────────
  // 選項清單 = 啟用中的設定 ∪ 排程資料中實際出現的值（含已停用/孤兒值），
  // 這樣停用工作類別／測試單位／測試人員只會影響新增/編輯表單，
  // 不會讓既有排程從篩選器中消失（停用者以「（已停用）」標示）。
  // 工作類別／測試單位改名時 value 會跟著 label 同步更新（見 optionsStore.ts
  // updateCategory / updateTestUnit），因此兩者恆相等，用 label 當 value 建選項是安全的。
  const categoryConfigured = useMemo(
    () => options.categories.map(c => ({ value: c.label, label: c.label, isActive: c.isActive })),
    [options.categories]
  )
  // 排序交給 buildFilterOptions 內部處理（啟用中選項依設定順序在前、
  // 其餘非設定值以穩定順序附加在後），這裡不再額外 .sort()，
  // 才能跟 FilterSortBar.tsx 給出一致、可預期的順序。
  const categoryFilterOptions = useMemo(
    () => buildFilterOptions(categoryConfigured, schedules.map(s => s.category)),
    [categoryConfigured, schedules]
  )
  const categoryFilterLabels = useMemo(
    () => buildOptionLabels(
      categoryFilterOptions,
      buildInactiveValueSet(categoryConfigured),
      buildLabelByValue(categoryConfigured),
    ),
    [categoryFilterOptions, categoryConfigured]
  )

  // 圖表用的類別清單（colorOf 配色 / TrendSection / LoadSection）維持只取啟用中類別，
  // 與篩選下拉的選項清單分開計算，避免停用類別的配色/圖表分組跟著意外改變。
  const categoryOptions = useMemo(
    () => options.categories.filter(c => c.isActive).map(c => c.label).sort(),
    [options.categories]
  )

  const unitConfigured = useMemo(
    () => options.testUnits.map(u => ({ value: u.label, label: u.label, isActive: u.isActive })),
    [options.testUnits]
  )
  const unitOptions = useMemo(
    () => buildFilterOptions(unitConfigured, schedules.map(s => s.testUnit)),
    [unitConfigured, schedules]
  )
  const unitLabels = useMemo(
    () => buildOptionLabels(
      unitOptions,
      buildInactiveValueSet(unitConfigured),
      buildLabelByValue(unitConfigured),
    ),
    [unitOptions, unitConfigured]
  )

  // ★ finding 3：s.testEngineer 存的是 value，改名後 value 不再等於 label
  // （比照 FilterSortBar.tsx 的 testEngineers 篩選，同樣以 value 建立選項），
  // 否則改名後這裡選的是舊 label，比對 filtered 時永遠對不到任何排程。
  // 此處不依 filter.testUnits narrow（與 FilterSortBar 不同，維持原有全單位範圍）。
  const engineerConfigured = useMemo(
    () => options.testUnits.flatMap(u => u.engineers),
    [options.testUnits]
  )
  const engineerOptions = useMemo(
    () => buildFilterOptions(engineerConfigured, schedules.map(s => s.testEngineer)),
    [engineerConfigured, schedules]
  )
  const engineerLabels = useMemo(
    () => buildOptionLabels(
      engineerOptions,
      buildInactiveValueSet(engineerConfigured),
      buildLabelByValue(engineerConfigured),
    ),
    [engineerOptions, engineerConfigured]
  )

  // 顏色跟著類別走（啟用類別清單索引），篩選不重排
  const colorOf = useMemo(() => {
    const map = new Map(categoryOptions.map((c, i) => [c, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]))
    return (cat: string) => map.get(cat) ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1]
  }, [categoryOptions])

  const filtered = useMemo(() => schedules.filter(s => {
    if (filter.categories.length > 0 && !filter.categories.includes(s.category)) return false
    if (filter.testUnits.length > 0 && !filter.testUnits.includes(s.testUnit)) return false
    if (filter.testEngineers.length > 0 && !filter.testEngineers.includes(s.testEngineer)) return false
    if (filter.statuses.length > 0 && !filter.statuses.includes(computeStatus(s))) return false
    return true
  }), [schedules, filter])

  // 依類別的 statsMode 分流：統計類元件吃 stats，負載元件吃 workload
  const { stats: statsSchedules, workload: workloadSchedules } = useMemo(
    () => splitByStatsMode(filtered, options.categories),
    [filtered, options.categories],
  )
  const excludedCount = filtered.length - statsSchedules.length

  const hasFilter = !isFilterEmpty(filter)

  return (
    <div>
      {/* 全域篩選列：sticky 固定，捲動不消失 */}
      <div className="sticky top-0 z-30 bg-gray-100/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 mr-2">統計分析</h2>
          <span className="text-xs text-gray-500">篩選</span>
          <MultiSelect label="工作類別" options={categoryFilterOptions} optionLabels={categoryFilterLabels}
            selected={filter.categories} onChange={v => setFilter({ ...filter, categories: v })} />
          <MultiSelect label="測試單位" options={unitOptions} optionLabels={unitLabels}
            selected={filter.testUnits} onChange={v => setFilter({ ...filter, testUnits: v })} />
          <MultiSelect label="測試人員" options={engineerOptions} optionLabels={engineerLabels}
            selected={filter.testEngineers} onChange={v => setFilter({ ...filter, testEngineers: v })} />
          <MultiSelect label="排程狀態" options={STATUS_OPTIONS}
            selected={filter.statuses} onChange={v => setFilter({ ...filter, statuses: v })} />
          {hasFilter && (
            <button type="button" onClick={() => setFilter(emptyFilter)}
              className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
              重置
            </button>
          )}
          {excludedCount > 0 && (
            <span className="text-xs text-gray-500">
              另有 {excludedCount} 筆因類別設定未計入專案統計
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">整體概覽</h3>
          <KpiSection schedules={statsSchedules} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5">
          <TrendSection schedules={statsSchedules} categories={categoryOptions} colorOf={colorOf} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5">
          <LoadSection schedules={workloadSchedules} categories={categoryOptions} colorOf={colorOf} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">風險清單</h3>
          <RiskList schedules={statsSchedules} />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-700">單位執行比較</h3>
            <UnitComparison schedules={statsSchedules} />
          </section>
          <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-700">延遲分析</h3>
            <DelayAnalysis schedules={statsSchedules} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsPage
