import { useState, useEffect, useRef } from 'react'
import {
  ArrowUp, ArrowDown, X, Plus,
  SlidersHorizontal, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight,
  CalendarRange, RotateCcw,
  Bookmark, ShieldCheck, EyeOff, Search,
} from 'lucide-react'
import { useOptionsStore } from '../../store/optionsStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { MultiSelectDropdown, summarizeSelection } from '../shared/MultiSelectDropdown'
import {
  buildFilterOptions, buildInactiveValueSet,
  buildEngineerFilterOptions, buildEngineerInactiveValueSet,
  buildOptionLabels, buildLabelByValue, buildEngineerLabelByValue,
} from '../../lib/filterOptions'
import { STATUS_LABELS, statusLabel, type ScheduleStatus } from '../../lib/status'
import type { Role } from '../../types'

// ── 排序型別 ─────────────────────────────────────────
export type SortableField =
  | 'testUnit' | 'testEngineer' | 'startDate'
  | 'endDate' | 'category' | 'status' | 'timeResource'

export interface SortRule {
  field: SortableField
  dir: 'asc' | 'desc'
}

export const SORTABLE_OPTIONS: { value: SortableField; label: string }[] = [
  { value: 'testUnit',     label: '測試單位' },
  { value: 'testEngineer', label: '測試人員' },
  { value: 'startDate',    label: '起始日期' },
  { value: 'endDate',      label: '完成日期' },
  { value: 'category',     label: '工作類別' },
  { value: 'status',       label: '狀態' },
  { value: 'timeResource', label: '時間資源' },
]

export const DEFAULT_SORT_RULES: SortRule[] = [
  { field: 'testUnit',     dir: 'asc' },
  { field: 'testEngineer', dir: 'asc' },
  { field: 'startDate',    dir: 'asc' },
]

const MAX_SORT_RULES = 4

// ── FilterSortState ──────────────────────────────────
export interface FilterSortState {
  categories:     string[]
  testUnits:      string[]
  testEngineers:  string[]
  statuses:       ScheduleStatus[]
  keyword:        string
  sortRules:      SortRule[]
  ganttStart:     string
  ganttEnd:       string
  showAllUnits:   boolean
  showUserFlagged:  boolean   // ★ only show schedules with userFlag = true
  showAdminFlagged: boolean   // ★ only show schedules with adminFlag = true (Admin/SA only)
  devices:          string[]  // ★ 設備視角的設備篩選（未勾選 = 顯示全部）
}

export const EMPTY_FILTER: FilterSortState = {
  categories: [], testUnits: [], testEngineers: [], statuses: [],
  keyword: '',
  sortRules: [...DEFAULT_SORT_RULES],
  ganttStart: '', ganttEnd: '',
  showAllUnits: false,
  showUserFlagged: false,
  showAdminFlagged: false,
  devices: [],
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 預設甘特圖範圍：今日 −1 個月 ～ +6 個月，
// 讓時間軸畫布寬度不隨歷史資料累積而成長
function defaultGanttRange(): { ganttStart: string; ganttEnd: string } {
  const start = new Date(); start.setMonth(start.getMonth() - 1)
  const end = new Date(); end.setMonth(end.getMonth() + 6)
  return { ganttStart: fmtDate(start), ganttEnd: fmtDate(end) }
}

// 登入時的預設篩選：隱藏 Completed（可在「狀態」下拉勾回）+ 預設時間範圍；
// 「清除全部」仍回到 EMPTY_FILTER（顯示全部）
export const DEFAULT_FILTER: FilterSortState = {
  ...EMPTY_FILTER,
  statuses: ['Delayed', 'Testing', 'Planned'],
  ...defaultGanttRange(),
}

const ALL_STATUSES: ScheduleStatus[] = ['Completed', 'Delayed', 'Testing', 'Planned', 'Cancelled']

/**
 * 收合時「N 項篩選」要顯示的數字。
 *
 * 舊版把「勾了幾個值」當成「有幾項篩選」：登入時的預設狀態勾了三個
 * （Delayed／Testing／Planned）算三項，起始日期與結束日期各算一項，
 * 於是使用者什麼都還沒做就被告知有「5 項篩選」。訪客最常在這裡誤以為
 * 資料不見了。
 *
 * 改成計算「有幾個條件正在縮小結果」—— 一個下拉不管勾了幾個值都只算
 * 一項，起訖日期合起來算一項，狀態勾滿五個等於沒篩選所以不算。
 *
 * showAllUnits 刻意不列入：它是把結果變多而不是變少，舊版把它算成一項
 * 是反的；而且它本來就有一顆常駐可見的切換鈕，不需要再由數字轉述。
 */
export function countNarrowingFilters(v: FilterSortState): number {
  let n = 0
  if (v.categories.length)    n++
  if (v.testUnits.length)     n++
  if (v.testEngineers.length) n++
  if (v.devices.length)       n++
  if (v.keyword.trim())       n++
  // 空陣列 = 不限狀態；勾滿全部也等於不限
  if (v.statuses.length > 0 && v.statuses.length < ALL_STATUSES.length) n++
  // 起訖日期是同一個條件的兩端，合起來算一項
  if (v.ganttStart || v.ganttEnd) n++
  if (v.showUserFlagged)  n++
  if (v.showAdminFlagged) n++
  return n
}

/**
 * 目前被狀態篩選擋在外面的狀態。空陣列代表沒有東西被狀態擋掉。
 * 登入預設會擋掉 Completed 與 Cancelled，這件事必須說出來，否則使用者
 * 只會看到「排程比預期少」而不知道原因。
 */
export function hiddenStatuses(v: FilterSortState): ScheduleStatus[] {
  if (v.statuses.length === 0) return []
  return ALL_STATUSES.filter(s => !v.statuses.includes(s))
}

/** 狀態 chip 的文字：擋掉 ≤2 個時列出被隱藏的，否則列出已選的。一律顯示中文。 */
export function statusChipText(v: FilterSortState): string {
  const hidden = hiddenStatuses(v)
  return hidden.length <= 2
    ? hidden.map(statusLabel).join('、')
    : summarizeSelection(v.statuses, STATUS_LABELS)
}

function toInputVal(s: string): string { return s ? s.replace(/\//g, '-') : '' }
function fromInputVal(s: string): string { return s ? s.replace(/-/g, '/') : '' }
function getLabelForField(field: SortableField): string {
  return SORTABLE_OPTIONS.find(o => o.value === field)?.label ?? field
}

interface Props {
  value:            FilterSortState
  onChange:         (v: FilterSortState) => void
  collapsed:        boolean
  onToggleCollapse: () => void
  role:             Role | null
  groupBy?:         'engineer' | 'device'
}

export function FilterSortBar({ value, onChange, collapsed, onToggleCollapse, role, groupBy = 'engineer' }: Props) {
  const { options } = useOptionsStore()
  const { schedules } = useScheduleStore()
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // 面板改成浮層之後會蓋住下方內容，因此點外面要收掉。
  // 面板內的多選下拉是渲染在面板裡（不是 portal），所以那些點擊仍算在 root 內。
  useEffect(() => {
    if (collapsed) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onToggleCollapse()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [collapsed, onToggleCollapse])

  // 點擊外部關閉新增下拉
  useEffect(() => {
    if (!addOpen) return
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addOpen])

  // 選項清單 = 啟用中的設定 ∪ 排程資料中實際出現的值（含已停用/孤兒值），
  // 這樣停用工作類別／測試單位／測試人員只會影響新增/編輯表單，
  // 不會讓既有排程從篩選器中消失（停用者以「（已停用）」標示）。
  const cats = buildFilterOptions(options.categories, schedules.map(s => s.category))
  const catLabels = buildOptionLabels(
    cats,
    buildInactiveValueSet(options.categories),
    buildLabelByValue(options.categories),
  )

  const units = buildFilterOptions(options.testUnits, schedules.map(s => s.testUnit))
  const unitLabels = buildOptionLabels(
    units,
    buildInactiveValueSet(options.testUnits),
    buildLabelByValue(options.testUnits),
  )

  const engineers = buildEngineerFilterOptions(options.testUnits, schedules, value.testUnits)
  const engineerLabels = buildOptionLabels(
    engineers,
    buildEngineerInactiveValueSet(options.testUnits, value.testUnits),
    buildEngineerLabelByValue(options.testUnits, value.testUnits),
  )

  const set = (patch: Partial<FilterSortState>) => onChange({ ...value, ...patch })

  // ── 排序操作 ──────────────────────────────────────
  const rules = value.sortRules
  const setSortRules = (next: SortRule[]) => set({ sortRules: next })
  const toggleDir = (idx: number) => {
    const next = [...rules]
    next[idx] = { ...next[idx], dir: next[idx].dir === 'asc' ? 'desc' : 'asc' }
    setSortRules(next)
  }
  const moveUp = (idx: number) => {
    if (idx <= 0) return
    const next = [...rules]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSortRules(next)
  }
  const moveDown = (idx: number) => {
    if (idx >= rules.length - 1) return
    const next = [...rules]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSortRules(next)
  }
  const removeRule = (idx: number) => setSortRules(rules.filter((_, i) => i !== idx))
  const addRule = (field: SortableField) => {
    setSortRules([...rules, { field, dir: 'asc' }])
    setAddOpen(false)
  }
  const resetSort = () => setSortRules([...DEFAULT_SORT_RULES])

  const usedFields = new Set(rules.map(r => r.field))
  const availableFields = SORTABLE_OPTIONS.filter(o => !usedFields.has(o.value))
  const isDefault =
    rules.length === DEFAULT_SORT_RULES.length &&
    rules.every((r, i) => r.field === DEFAULT_SORT_RULES[i].field && r.dir === DEFAULT_SORT_RULES[i].dir)

  const activeCount = countNarrowingFilters(value)
  const hidden = hiddenStatuses(value)

  const hasGanttRange = !!(value.ganttStart || value.ganttEnd)

  // ── 生效中的條件 ─────────────────────────────────────
  // 改版前收合時只看得到「N 項篩選」一個數字，要展開才知道自己在看什麼，
  // 而展開會把甘特圖往下推 126px。現在條件逐項列在永遠可見的一列上，
  // 每顆都能直接移除，編輯用的面板改成浮層，不再推擠內容。
  interface ActiveChip { key: string; label?: string; text: string; icon?: React.ReactNode; onRemove: () => void }
  const chips: ActiveChip[] = []

  if (value.categories.length)
    chips.push({ key: 'cat', label: '類別', text: summarizeSelection(value.categories, catLabels), onRemove: () => set({ categories: [] }) })
  if (value.testUnits.length)
    chips.push({ key: 'unit', label: '單位', text: summarizeSelection(value.testUnits, unitLabels), onRemove: () => set({ testUnits: [], testEngineers: [] }) })
  if (value.testEngineers.length)
    chips.push({ key: 'eng', label: '人員', text: summarizeSelection(value.testEngineers, engineerLabels), onRemove: () => set({ testEngineers: [] }) })
  if (value.devices.length)
    chips.push({ key: 'dev', label: '設備', text: summarizeSelection(value.devices), onRemove: () => set({ devices: [] }) })

  // 狀態用「擋掉了什麼」還是「留下了什麼」來說，取決於哪一句比較短。
  // 登入預設留三個、擋兩個，說「已隱藏 已完成、已取消」比說
  // 「狀態：延遲、測試中 +1」更接近使用者真正需要知道的事。
  if (value.statuses.length > 0 && value.statuses.length < ALL_STATUSES.length) {
    const byHidden = hidden.length <= 2
    chips.push({
      key: 'status',
      label: byHidden ? '已隱藏' : '狀態',
      icon: byHidden ? <EyeOff size={11} /> : undefined,
      text: statusChipText(value),
      onRemove: () => set({ statuses: [] }),
    })
  }
  if (hasGanttRange)
    chips.push({ key: 'range', label: '期間', text: `${value.ganttStart || '最早'} ～ ${value.ganttEnd || '最晚'}`, onRemove: () => set({ ganttStart: '', ganttEnd: '' }) })
  if (value.showUserFlagged)
    chips.push({ key: 'uflag', text: '只顯示已標記', onRemove: () => set({ showUserFlagged: false }) })
  if (value.showAdminFlagged)
    chips.push({ key: 'aflag', text: '只顯示 Admin 標記', onRemove: () => set({ showAdminFlagged: false }) })
  // showAllUnits 不做成 chip：它在工具列已經有一組常駐可見的分段控制，
  // 再多一顆 chip 等於同一件事在畫面上說兩次。

  const sortSummary = rules.map(r => getLabelForField(r.field)).join(' › ')

  return (
    <div ref={rootRef} className="relative flex-shrink-0 border-b border-stone-300 bg-white">

      {/* ── 條件列：永遠可見，一排 ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto whitespace-nowrap">

        {/* 搜尋從面板裡搬出來。它是最常用的一項，卻原本藏在要展開才看得到的地方 */}
        <div className="relative flex-shrink-0">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={value.keyword}
            onChange={e => set({ keyword: e.target.value })}
            placeholder="搜尋 PDN、工作內容、人員…"
            aria-label="搜尋排程"
            className="w-56 border border-stone-300 rounded-md pl-7 pr-6 py-1 text-xs bg-white
                       placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-400
                       focus:border-transparent"
          />
          {value.keyword && (
            <button type="button" aria-label="清除搜尋" onClick={() => set({ keyword: '' })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              <X size={12} />
            </button>
          )}
        </div>

        {/* 生效中的條件，每顆可直接移除 */}
        {chips.map(c => (
          <span key={c.key}
            className="inline-flex flex-shrink-0 items-center gap-1 h-6 pl-2 pr-1 rounded-full
                       text-xs bg-blue-50 border border-blue-200 text-blue-800">
            {c.icon}
            {c.label && <span className="text-blue-600">{c.label}</span>}
            <span className="font-medium max-w-[200px] truncate">{c.text}</span>
            <button
              type="button"
              aria-label={`移除篩選 ${c.label ?? ''}${c.text}`}
              onClick={c.onRemove}
              className="w-4 h-4 flex items-center justify-center rounded-full
                         text-blue-500 hover:bg-blue-200 hover:text-blue-900 transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {/* 面板開關 */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className={`inline-flex flex-shrink-0 items-center gap-1 h-6 px-2 rounded-full
                      text-xs font-medium border transition-colors
            ${collapsed
              ? 'bg-white border-dashed border-stone-300 text-stone-500 hover:border-blue-400 hover:text-blue-700'
              : 'bg-stone-700 border-stone-700 text-white'}`}
        >
          <SlidersHorizontal size={11} />
          {chips.length > 0 ? '篩選' : '＋ 篩選'}
          {activeCount > 0 && (
            <span className="tnum text-[10px] font-semibold px-1 rounded-full bg-blue-100 text-blue-800">
              {activeCount}
            </span>
          )}
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        {chips.length > 0 && (
          <button type="button" onClick={() => onChange(EMPTY_FILTER)}
            className="flex-shrink-0 px-1 text-xs text-stone-500 hover:text-red-600 hover:underline">
            清除全部
          </button>
        )}

        {/* 排序縮成一行字。多層排序不常改，不需要一直佔著四顆 chip 的寬度 */}
        <button
          type="button"
          onClick={onToggleCollapse}
          title="在篩選面板中調整排序"
          className="ml-auto flex-shrink-0 px-1 text-xs text-stone-500 hover:text-blue-700"
        >
          排序：<span className="text-stone-700">{sortSummary}</span>
          {!isDefault && <span className="ml-1 text-amber-600">（自訂）</span>}
        </button>
      </div>

      {/* ── 編輯面板 ──
          改為絕對定位的浮層。改版前展開會把甘特圖整個往下推 126px，
          等於「想看清楚在篩什麼」與「想看到排程」二選一。 */}
      {!collapsed && (
        <div className="absolute left-0 right-0 top-full z-40
                        bg-stone-50 border-b border-stone-300 shadow-lg
                        px-4 pt-2 pb-3 space-y-2.5">

          {/* ═══ 第一排：篩選條件 ═══ */}
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
            <MultiSelectDropdown label="工作類別" options={cats} optionLabels={catLabels}
              selected={value.categories} onChange={categories => set({ categories })} />
            <MultiSelectDropdown label="測試單位" options={units} optionLabels={unitLabels}
              selected={value.testUnits} onChange={testUnits => set({ testUnits, testEngineers: [] })} />
            <MultiSelectDropdown label="測試人員" options={engineers} optionLabels={engineerLabels}
              selected={value.testEngineers} onChange={testEngineers => set({ testEngineers })} />
            <MultiSelectDropdown label="狀態" options={ALL_STATUSES} optionLabels={STATUS_LABELS}
              selected={value.statuses} onChange={statuses => set({ statuses: statuses as ScheduleStatus[] })} />

            {/* 設備篩選（只在設備視角顯示） */}
            {groupBy === 'device' && (options.devices ?? []).filter(d => d.isActive).length > 0 && (
              <MultiSelectDropdown
                label="設備"
                options={(options.devices ?? []).filter(d => d.isActive).map(d => d.value)}
                selected={value.devices}
                onChange={devices => set({ devices })}
              />
            )}

            {/* 關鍵字已搬到永遠可見的條件列，這裡不再重複一份輸入框 */}
          </div>

          {/* ═══ 第二排：甘特圖範圍 + 排序 + 清除 ═══ */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 items-center
                          pt-2 border-t border-stone-200">

            {/* 甘特圖範圍 */}
            <div className="flex items-center gap-1.5">
              <CalendarRange size={13} className="text-stone-400" />
              <span className="text-xs font-medium text-stone-500">甘特圖</span>
              <input type="date" value={toInputVal(value.ganttStart)}
                onChange={e => {
                  const v = fromInputVal(e.target.value)
                  const end = value.ganttEnd
                  set({ ganttStart: v, ganttEnd: end && v && end < v ? '' : end })
                }}
                className="border border-stone-300 rounded-md px-2 py-1 text-xs
                           focus:outline-none focus:ring-2 focus:ring-blue-400
                           bg-white text-stone-700 w-[120px]" />
              <span className="text-stone-400 text-xs">～</span>
              <input type="date" value={toInputVal(value.ganttEnd)}
                min={toInputVal(value.ganttStart)}
                onChange={e => set({ ganttEnd: fromInputVal(e.target.value) })}
                className="border border-stone-300 rounded-md px-2 py-1 text-xs
                           focus:outline-none focus:ring-2 focus:ring-blue-400
                           bg-white text-stone-700 w-[120px]" />
              {hasGanttRange && (
                <button type="button" onClick={() => set({ ganttStart: '', ganttEnd: '' })}
                  className="text-stone-400 hover:text-red-500 transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* 分隔線 */}
            <div className="w-px h-5 bg-stone-300 hidden sm:block" />

            {/* ★ 排序 Chips ★ */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-stone-500 mr-0.5">排序</span>

              {rules.map((rule, idx) => (
                <div
                  key={`${rule.field}-${idx}`}
                  className="inline-flex items-center h-7 bg-white border border-stone-200
                             rounded-full text-xs shadow-sm overflow-hidden"
                >
                  {/* ◀ 左移 */}
                  <button type="button" disabled={idx === 0} onClick={() => moveUp(idx)}
                    className="w-5 h-full flex items-center justify-center
                               text-stone-300 hover:text-stone-600 hover:bg-stone-100
                               disabled:opacity-0 disabled:w-0 disabled:overflow-hidden
                               transition-all">
                    <ChevronLeft size={11} />
                  </button>

                  {/* 序號 + 欄位名 */}
                  <span className="text-[10px] text-stone-500 font-mono ml-0.5">{idx + 1}</span>
                  <span className="text-stone-700 font-medium mx-1 whitespace-nowrap">
                    {getLabelForField(rule.field)}
                  </span>

                  {/* 方向切換 */}
                  <button type="button" onClick={() => toggleDir(idx)}
                    title={rule.dir === 'asc' ? '升冪 → 點擊切換' : '降冪 → 點擊切換'}
                    className="w-5 h-5 flex items-center justify-center rounded-full
                               hover:bg-stone-100 transition-colors">
                    {rule.dir === 'asc'
                      ? <ArrowUp size={11} className="text-blue-500" />
                      : <ArrowDown size={11} className="text-orange-500" />
                    }
                  </button>

                  {/* ▶ 右移 */}
                  <button type="button" disabled={idx === rules.length - 1} onClick={() => moveDown(idx)}
                    className="w-5 h-full flex items-center justify-center
                               text-stone-300 hover:text-stone-600 hover:bg-stone-100
                               disabled:opacity-0 disabled:w-0 disabled:overflow-hidden
                               transition-all">
                    <ChevronRight size={11} />
                  </button>

                  {/* ✕ 移除 */}
                  <button type="button" onClick={() => removeRule(idx)}
                    className="w-5 h-full flex items-center justify-center
                               border-l border-stone-200
                               text-stone-300 hover:text-red-500 hover:bg-red-50
                               transition-colors">
                    <X size={11} />
                  </button>
                </div>
              ))}

              {/* ＋ 新增 */}
              {rules.length < MAX_SORT_RULES && availableFields.length > 0 && (
                <div ref={addRef} className="relative">
                  <button type="button" onClick={() => setAddOpen(!addOpen)}
                    className="inline-flex items-center gap-0.5 h-7 px-2
                               text-xs text-stone-500 hover:text-blue-600
                               bg-white border border-dashed border-stone-300
                               rounded-full hover:border-blue-400
                               transition-colors">
                    <Plus size={11} />
                    <span>新增</span>
                  </button>
                  {addOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50
                                    bg-white border border-stone-200 rounded-lg shadow-lg
                                    min-w-[140px] py-1">
                      {availableFields.map(opt => (
                        <button key={opt.value} type="button" onClick={() => addRule(opt.value)}
                          className="w-full text-left px-3 py-1.5 text-xs text-stone-700
                                     hover:bg-blue-50 hover:text-blue-700 transition-colors">
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ↻ 重置 */}
              {!isDefault && (
                <button type="button" onClick={resetSort}
                  title="重置為預設排序"
                  className="inline-flex items-center gap-0.5 h-7 px-2
                             text-xs text-blue-500 hover:text-blue-700
                             bg-blue-50 border border-blue-200
                             rounded-full hover:bg-blue-100
                             transition-colors">
                  <RotateCcw size={10} />
                  <span>重置</span>
                </button>
              )}
            </div>

            {/* 分隔線 */}
            <div className="w-px h-5 bg-stone-300 hidden sm:block" />

            {/* 「我的排程／全部」已移到工具列的分段控制。測試人員登入後預設
                只看自己的排程，那件事重要到不該埋在要展開才看得到的面板裡。 */}

            {/* 使用者旗標篩選。訪客不顯示：guest 無法建立旗標，
                給他一個篩自己標不了的東西的開關只是多餘的選項。 */}
            {role !== 'guest' && (
              <button
                type="button"
                aria-pressed={value.showUserFlagged}
                onClick={() => onChange({ ...value, showUserFlagged: !value.showUserFlagged })}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
                  ${value.showUserFlagged
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
              >
                <Bookmark size={13} />
                只顯示已標記
              </button>
            )}

            {/* Admin 旗標篩選（Admin/SA 限定；guest 看不到 adminFlag 資料） */}
            {(role === 'super_admin' || role === 'admin') && (
              <button
                type="button"
                aria-pressed={value.showAdminFlagged}
                onClick={() => onChange({ ...value, showAdminFlagged: !value.showAdminFlagged })}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
                  ${value.showAdminFlagged
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                  }`}
              >
                <ShieldCheck size={13} />
                只顯示 Admin 標記
              </button>
            )}

            {/* 清除篩選 */}
            <button type="button" onClick={() => onChange(EMPTY_FILTER)}
              className="inline-flex items-center gap-1 h-7 px-2.5
                         text-xs font-medium rounded-full
                         border border-stone-300 text-stone-600 bg-white
                         hover:border-red-300 hover:bg-red-50 hover:text-red-600
                         transition-colors">
              <X size={11} />
              清除全部
            </button>
          </div>

        </div>
      )}
    </div>
  )
}