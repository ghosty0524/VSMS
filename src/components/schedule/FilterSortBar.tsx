import { useState, useEffect, useRef } from 'react'
import {
  ArrowUp, ArrowDown, X, Plus,
  SlidersHorizontal, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight,
  CalendarRange, RotateCcw,
  Bookmark, ShieldCheck,
} from 'lucide-react'
import { useOptionsStore } from '../../store/optionsStore'
import { MultiSelectDropdown } from '../shared/MultiSelectDropdown'
import type { ScheduleStatus } from '../../lib/status'

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

const ALL_STATUSES: ScheduleStatus[] = ['Completed', 'Delayed', 'Testing', 'Planned']

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
  role:             'super_admin' | 'admin' | 'user' | null
  groupBy?:         'engineer' | 'device'
}

export function FilterSortBar({ value, onChange, collapsed, onToggleCollapse, role, groupBy = 'engineer' }: Props) {
  const { options } = useOptionsStore()
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  // 點擊外部關閉新增下拉
  useEffect(() => {
    if (!addOpen) return
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addOpen])

  const cats = options.categories.filter(c => c.isActive).map(c => c.value)
  const units = options.testUnits.filter(u => u.isActive).map(u => u.value)
  const engineers = Array.from(new Set(
    options.testUnits
      .filter(u => value.testUnits.length === 0 || value.testUnits.includes(u.value))
      .flatMap(u => u.engineers.filter(e => e.isActive).map(e => e.value))
  ))

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

  const activeCount =
    value.categories.length + value.testUnits.length +
    value.testEngineers.length + value.statuses.length +
    (value.keyword ? 1 : 0) + (value.ganttStart ? 1 : 0) + (value.ganttEnd ? 1 : 0) +
    (role === 'user' && value.showAllUnits ? 1 : 0) +
    (value.showUserFlagged ? 1 : 0) +
    (value.showAdminFlagged ? 1 : 0) +
    (value.devices.length)

  const hasGanttRange = !!(value.ganttStart || value.ganttEnd)

  return (
    <div className="border-b-2 border-stone-300">

      {/* ── 收合 Header（暖灰） ── */}
      <div
        className="flex items-center justify-between px-4 py-2
                   bg-stone-100 cursor-pointer
                   hover:bg-stone-200 transition-colors duration-150 select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-stone-500" />
          <span className="text-sm font-semibold text-stone-700">篩選與排序</span>
          {activeCount > 0 && (
            <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
              {activeCount} 項篩選
            </span>
          )}
          {!isDefault && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              自訂排序
            </span>
          )}
        </div>
        <span className="text-stone-400">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </div>

      {/* ── 篩選內容（暖灰底） ── */}
      {!collapsed && (
        <div className="px-4 pt-2 pb-3 bg-stone-50 space-y-2.5">

          {/* ═══ 第一排：篩選條件 ═══ */}
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
            <MultiSelectDropdown label="工作類別" options={cats}
              selected={value.categories} onChange={categories => set({ categories })} />
            <MultiSelectDropdown label="測試單位" options={units}
              selected={value.testUnits} onChange={testUnits => set({ testUnits, testEngineers: [] })} />
            <MultiSelectDropdown label="測試人員" options={engineers}
              selected={value.testEngineers} onChange={testEngineers => set({ testEngineers })} />
            <MultiSelectDropdown label="狀態" options={ALL_STATUSES}
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

            {/* 關鍵字 */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-500">關鍵字</span>
              <div className="relative">
                <input type="text" value={value.keyword}
                  onChange={e => set({ keyword: e.target.value })}
                  placeholder="搜尋…"
                  className="border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm
                             w-36 focus:outline-none focus:ring-2 focus:ring-blue-400
                             focus:border-transparent bg-white placeholder-stone-400" />
                {value.keyword && (
                  <button type="button" onClick={() => set({ keyword: '' })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
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
                  <span className="text-[10px] text-stone-400 font-mono ml-0.5">{idx + 1}</span>
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

            {/* ★ 顯示所有單位切換 (User 專屬) */}
            {role === 'user' && (
              <button
                type="button"
                aria-pressed={value.showAllUnits}
                title="切換顯示所有單位"
                onClick={() => {
                  const next = { ...value, showAllUnits: !value.showAllUnits }
                  localStorage.setItem('vsms-show-all-units', String(next.showAllUnits))
                  onChange(next)
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors
                  ${value.showAllUnits
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
              >
                <span>👁</span>
                {value.showAllUnits ? '所有單位 ✓' : '顯示所有單位'}
              </button>
            )}

            {/* 使用者旗標篩選（全角色） */}
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

            {/* Admin 旗標篩選（Admin/SA 限定） */}
            {role !== 'user' && (
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
            <button type="button" onClick={() => {
              localStorage.setItem('vsms-show-all-units', 'false')
              onChange(EMPTY_FILTER)
            }}
              className="inline-flex items-center gap-1 h-7 px-2.5
                         text-xs font-medium rounded-full
                         border border-red-200 text-red-500 bg-white
                         hover:bg-red-50 hover:border-red-300
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