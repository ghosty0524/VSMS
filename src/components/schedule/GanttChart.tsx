import { useState, useEffect, useRef } from 'react'
import { Pencil, Trash2, CalendarRange } from 'lucide-react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useAuthStore } from '../../store/authStore'
import { getUnitColor, STATUS_COLORS, OVERFLOW_COLOR } from '../../constants'
import { computeStatus } from '../../lib/status'
import { isRestDay } from '../../lib/restDays'
import { FilterSortBar, EMPTY_FILTER, DEFAULT_SORT_RULES } from './FilterSortBar'
import { ScheduleFormModal } from './ScheduleFormModal'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import type { FilterSortState, SortRule, SortableField } from './FilterSortBar'
import type { Schedule } from '../../types'
import type { ScheduleStatus } from '../../lib/status'

// ── 尺寸常數 ──────────────────────────────────────────
const LEFT_W       = 248
const ROW_H        = 46
const HEADER_H     = 90
const HEADER_MONTH = 30
const HEADER_WEEK  = 20
const HEADER_DAY   = 40
const PX_PER_DAY   = 22

// ── Tooltip 定位常數 ──────────────────────────────────────
const TOOLTIP_ESTIMATE_W = 220
const TOOLTIP_ESTIMATE_H = 180
const TOOLTIP_OFFSET     = 14

export function getTooltipPosition(
  x: number,
  y: number,
  vw = window.innerWidth,
  vh = window.innerHeight,
): { left: number; top: number } {
  const left =
    x + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_W > vw
      ? x - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W
      : x + TOOLTIP_OFFSET
  const top =
    y + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_H > vh
      ? y - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H
      : y + TOOLTIP_OFFSET
  return { left, top }
}

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function parseDate(s: string): Date {
  const [y, m, d] = s.split('/').map(Number)
  const date = new Date(y, m - 1, d)
  // 防禦壞資料（格式不符導致 NaN），fallback 到今日避免 SVG 崩壞
  return isNaN(date.getTime()) ? new Date() : date
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const STATUS_PRIORITY: Record<ScheduleStatus, number> = {
  Completed: 0, Delayed: 1, Testing: 2, Planned: 3,
}

// ★ 測試單位自訂排序
const UNIT_ORDER: Record<string, number> = {
  'SI': 0, 'RA': 1, 'SIT-SW': 2, 'SIT-HW': 3,
}
function getUnitOrder(unit: string): number {
  return UNIT_ORDER[unit] ?? 99
}

function getSortValue(s: Schedule, field: SortableField): string | number {
  switch (field) {
    case 'testUnit':     return getUnitOrder(s.testUnit)
    case 'testEngineer': return s.testEngineer
    case 'startDate':    return s.startDate
    case 'endDate':      return s.endDate
    case 'category':     return s.category
    case 'status':       return STATUS_PRIORITY[computeStatus(s)]
    case 'timeResource': return s.timeResource
    default:             return ''
  }
}

// ★ 計算 timeResource 工作天佔幾個日曆天（跳過休息日）
function getWorkDayOffset(
  startDate: Date,
  workDays: number,
  restDayConfig: { weekends: boolean; specificDates: string[] },
): number {
  if (workDays <= 0) return 0
  let count = 0
  let offset = 0
  const d = new Date(startDate)
  while (true) {
    if (!isRestDay(d, restDayConfig)) {
      count++
      if (count >= workDays) return offset + 1
    }
    offset++
    d.setDate(d.getDate() + 1)
  }
}

// ★ 多層排序
function applyFilter(
  schedules: Schedule[],
  fs: FilterSortState,
  role: 'super_admin' | 'admin' | 'user' | null,
  allowedUnits: string[],
): Schedule[] {
  let result = schedules.filter(s => {
    // ★ User allowedUnits filter (when showAllUnits is false and allowedUnits is non-empty)
    if (role === 'user' && !fs.showAllUnits && allowedUnits.length > 0) {
      if (!allowedUnits.includes(s.testUnit)) return false
    }
    if (fs.categories.length    && !fs.categories.includes(s.category))       return false
    if (fs.testUnits.length     && !fs.testUnits.includes(s.testUnit))         return false
    if (fs.testEngineers.length && !fs.testEngineers.includes(s.testEngineer)) return false
    if (fs.statuses.length      && !fs.statuses.includes(computeStatus(s)))    return false
    if (fs.keyword) {
      const kw     = fs.keyword.toLowerCase()
      const target = [s.projectName, s.taskDescription, s.requiredPersonnel, s.testReport]
        .join(' ').toLowerCase()
      if (!target.includes(kw)) return false
    }
    // ★ 時間篩選：移除與設定範圍無重疊的排程
    if (fs.ganttStart && s.endDate < fs.ganttStart) return false
    if (fs.ganttEnd   && s.startDate > fs.ganttEnd) return false
    return true
  })

  const rules: SortRule[] = fs.sortRules.length > 0 ? fs.sortRules : DEFAULT_SORT_RULES

  result = result.slice().sort((a, b) => {
    for (const rule of rules) {
      const av = getSortValue(a, rule.field)
      const bv = getSortValue(b, rule.field)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp
    }
    return 0
  })

  return result
}

interface Props {
  showAddModal:    boolean
  onCloseAddModal: () => void
  ganttCollapsed:  boolean
  onToggleGantt:   () => void
  filterCollapsed: boolean
  onToggleFilter:  () => void
}

export function GanttChart({
  showAddModal, onCloseAddModal,
  ganttCollapsed, onToggleGantt,
  filterCollapsed, onToggleFilter,
}: Props) {
  const { schedules, remove } = useScheduleStore()
  const { options }           = useOptionsStore()
  const { role, allowedUnits } = useAuthStore()
  const [filterSort, setFilterSort]     = useState<FilterSortState>(() => ({
    ...EMPTY_FILTER,
    showAllUnits: localStorage.getItem('vsms-show-all-units') === 'true',
  }))
  const [editTarget, setEditTarget]     = useState<Schedule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [tooltip, setTooltip]           = useState<{ x: number; y: number; s: Schedule } | null>(null)

  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = sessionStorage.getItem('ganttLeftWidth')
    const n = Number(saved)
    return saved && !isNaN(n) ? Math.min(600, Math.max(180, n)) : LEFT_W
  })

  const dragListenersRef = useRef<{
    move: (e: MouseEvent) => void
    up:   (e: MouseEvent) => void
  } | null>(null)

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = leftWidth

    const handleMouseMove = (ev: MouseEvent) => {
      const w = Math.min(600, Math.max(180, startWidth + ev.clientX - startX))
      setLeftWidth(w)
    }

    const handleMouseUp = (ev: MouseEvent) => {
      const finalW = Math.min(600, Math.max(180, startWidth + ev.clientX - startX))
      setLeftWidth(finalW)
      sessionStorage.setItem('ganttLeftWidth', String(finalW))
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      dragListenersRef.current = null
    }

    dragListenersRef.current = { move: handleMouseMove, up: handleMouseUp }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        document.removeEventListener('mousemove', dragListenersRef.current.move)
        document.removeEventListener('mouseup', dragListenersRef.current.up)
      }
    }
  }, [])

  const rightBodyRef   = useRef<HTMLDivElement>(null)
  const rightHeaderRef = useRef<HTMLDivElement>(null)
  const leftBodyRef    = useRef<HTMLDivElement>(null)
  const rafRef         = useRef<number | null>(null)

  const allUnits  = options.testUnits.map(u => u.value)
  const filtered  = applyFilter(schedules, filterSort, role, allowedUnits)

  // ── 時間軸範圍計算 ────────────────────────────────────
  const allScheduleDates = schedules.flatMap(s => [parseDate(s.startDate), parseDate(s.endDate)])

  const defaultStart = new Date(Math.min(...allScheduleDates.map(d => d.getTime())))
  defaultStart.setDate(defaultStart.getDate() - 1)

  const latestEnd    = new Date(Math.max(...allScheduleDates.map(d => d.getTime())))
  const todayPlus3M  = new Date(); todayPlus3M.setMonth(todayPlus3M.getMonth() + 3)
  const defaultEnd   = new Date(latestEnd > todayPlus3M ? latestEnd : todayPlus3M)
  defaultEnd.setDate(defaultEnd.getDate() + 1)

  const timelineStart = filterSort.ganttStart ? parseDate(filterSort.ganttStart) : defaultStart
  const rawEnd        = filterSort.ganttEnd   ? parseDate(filterSort.ganttEnd)   : defaultEnd
  const timelineEnd   = rawEnd > timelineStart ? rawEnd : defaultEnd
  const hasGanttRange = !!(filterSort.ganttStart || filterSort.ganttEnd)

  const totalDays   = daysBetween(timelineStart, timelineEnd)
  const svgWidth    = totalDays * PX_PER_DAY
  const bodyHeight  = filtered.length * ROW_H

  // ── 休息日設定（供 Bar 溢出計算 + 日曆標記共用） ───────
  const restDayConfig = options.restDays ?? { weekends: true, specificDates: [] }

  // ── Scroll 同步 ───────────────────────────────────────
  const handleRightBodyScroll = () => {
    if (!rightBodyRef.current) return
    const { scrollLeft, scrollTop } = rightBodyRef.current
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (rightHeaderRef.current) rightHeaderRef.current.scrollLeft = scrollLeft
      if (leftBodyRef.current) leftBodyRef.current.style.transform = `translateY(-${scrollTop}px)`
    })
  }

  const forwardWheelToBody = (e: React.WheelEvent) => {
    if (!rightBodyRef.current) return
    rightBodyRef.current.scrollTop  += e.deltaY
    rightBodyRef.current.scrollLeft += e.deltaX
  }

  useEffect(() => {
    if (!rightBodyRef.current || schedules.length === 0) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (filterSort.ganttStart) {
      rightBodyRef.current.scrollLeft = 0
    } else {
      const todayX = daysBetween(timelineStart, today) * PX_PER_DAY
      rightBodyRef.current.scrollLeft = todayX - rightBodyRef.current.clientWidth / 2
    }
    handleRightBodyScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSort.ganttStart, filterSort.ganttEnd])

  // ── 空資料 ────────────────────────────────────────────
  if (schedules.length === 0) {
    return (
      <>
        <FilterSortBar value={filterSort} onChange={setFilterSort}
          collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
          role={role} />
        <div className="flex-1 flex items-center justify-center bg-white rounded-lg shadow m-4">
          <div className="text-center text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-base font-medium text-gray-500">尚無工作排程</p>
            <p className="text-sm text-gray-400 mt-1">點擊右上角「＋ 新增排程」開始建立</p>
          </div>
        </div>
        <ScheduleFormModal isOpen={showAddModal} schedule={null} onClose={onCloseAddModal} />
      </>
    )
  }

  // ── 月份標記 ──────────────────────────────────────────
  const monthLabels: { x: number; label: string }[] = []
  const cursor = new Date(timelineStart); cursor.setDate(1)
  while (cursor <= timelineEnd) {
    const x = daysBetween(timelineStart, cursor) * PX_PER_DAY
    if (x >= 0)
      monthLabels.push({ x, label: `${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}` })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // ── 週次標記 ──────────────────────────────────────────
  const weekTicks: { x: number; label: string }[] = []
  const tickCursor = new Date(timelineStart)
  const dow0 = tickCursor.getDay()
  tickCursor.setDate(tickCursor.getDate() + (dow0 === 0 ? 0 : 7 - dow0))
  while (tickCursor <= timelineEnd) {
    const x = daysBetween(timelineStart, tickCursor) * PX_PER_DAY
    if (x >= 0)
      weekTicks.push({ x, label: `${String(tickCursor.getMonth() + 1).padStart(2, '0')}/${String(tickCursor.getDate()).padStart(2, '0')}` })
    tickCursor.setDate(tickCursor.getDate() + 7)
  }

  // ── 每日：休息日 + 星期標記 ───────────────────────────
  const restDayBgs:    { x: number }[] = []
  const dayLabelItems: { x: number; label: string; isRest: boolean }[] = []
  const dayCursor = new Date(timelineStart)
  while (dayCursor <= timelineEnd) {
    const x = daysBetween(timelineStart, dayCursor) * PX_PER_DAY
    if (x >= 0 && x < svgWidth) {
      const isRest = isRestDay(dayCursor, restDayConfig)
      if (isRest) restDayBgs.push({ x })
      dayLabelItems.push({ x, label: DAY_LABELS[dayCursor.getDay()], isRest })
    }
    dayCursor.setDate(dayCursor.getDate() + 1)
  }

  // ── 今日線 ────────────────────────────────────────────
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const todayX = daysBetween(timelineStart, today) * PX_PER_DAY

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow overflow-hidden">
      <FilterSortBar value={filterSort} onChange={setFilterSort}
        collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
        role={role} />

      {/* ── 圖例 ── */}
      <div className="flex-shrink-0 flex flex-wrap gap-4 px-4 py-2.5 border-b bg-white">
        {options.testUnits.filter(u => u.isActive).map(u => (
          <span key={u.id} className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0"
              style={{ background: getUnitColor(u.value, allUnits) }} />
            {u.label}
          </span>
        ))}
        {/* ★ 溢出色圖例 */}
        <span className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
          <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0"
            style={{ background: OVERFLOW_COLOR }} />
          超出時間資源
        </span>
      </div>

      {/* ── 甘特圖收合控制列 ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2
                   bg-slate-50 border-b cursor-pointer
                   hover:bg-slate-100 transition-colors duration-150 select-none"
        onClick={onToggleGantt}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">甘特圖</span>
          {hasGanttRange && (
            <span className="flex items-center gap-1 text-xs text-blue-600
                             bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              <CalendarRange size={11} />
              {filterSort.ganttStart || '最早'} ～ {filterSort.ganttEnd || '最晚'}
            </span>
          )}
        </div>
        <span className="text-slate-400 text-sm">
          {ganttCollapsed ? '▼ 展開' : '▲ 收合'}
        </span>
      </div>

      {/* ══ 甘特圖主體（四象限凍結窗格） ══ */}
      {!ganttCollapsed && (
        filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">

            {/* 上排 */}
            <div className="flex-shrink-0 flex" style={{ height: HEADER_H }}>
              <div className="shrink-0 border-r relative"
                style={{ width: leftWidth, height: HEADER_H }} onWheel={forwardWheelToBody}>
                <svg width={leftWidth} height={HEADER_H} className="block">
                  <rect x={0} y={0} width={leftWidth} height={HEADER_H} fill="#e2e8f0" />
                  <text x={12} y={HEADER_MONTH / 2 + 6} fontSize={13} fill="#334155" fontWeight="700">工作排程</text>
                  <line x1={0} y1={HEADER_MONTH} x2={leftWidth} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
                  <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={leftWidth} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                  <line x1={0} y1={HEADER_H - 1} x2={leftWidth} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />
                </svg>
              </div>

              <div ref={rightHeaderRef} className="flex-1 overflow-hidden" onWheel={forwardWheelToBody}>
                <svg width={svgWidth} height={HEADER_H} className="block">
                  <rect x={0} y={0} width={svgWidth} height={HEADER_H} fill="#f1f5f9" />
                  <line x1={0} y1={HEADER_MONTH} x2={svgWidth} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
                  <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={svgWidth} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                  <line x1={0} y1={HEADER_H - 1} x2={svgWidth} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />

                  {monthLabels.map((ml, i) => (
                    <g key={i}>
                      <line x1={ml.x} y1={0} x2={ml.x} y2={HEADER_H} stroke="#cbd5e1" strokeWidth={1} />
                      <text x={ml.x + 5} y={HEADER_MONTH / 2 + 6} fontSize={12} fill="#334155" fontWeight="700">{ml.label}</text>
                    </g>
                  ))}
                  {weekTicks.map((t, i) => (
                    <g key={i}>
                      <line x1={t.x} y1={HEADER_MONTH} x2={t.x} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                      <text x={t.x + 2} y={HEADER_MONTH + HEADER_WEEK / 2 + 5} fontSize={10} fill="#64748b" fontWeight="600">{t.label}</text>
                    </g>
                  ))}
                  {dayLabelItems.map((d, i) => (
                    <g key={i}>
                      <line x1={d.x} y1={HEADER_MONTH + HEADER_WEEK} x2={d.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={0.5} />
                      {PX_PER_DAY >= 16 && (
                        <text x={d.x + PX_PER_DAY / 2} y={HEADER_MONTH + HEADER_WEEK + HEADER_DAY / 2 + 5}
                          fontSize={10} fill={d.isRest ? '#ef4444' : '#64748b'} textAnchor="middle"
                          fontWeight={d.isRest ? '700' : '400'}>{d.label}</text>
                      )}
                    </g>
                  ))}
                  {today >= timelineStart && today <= timelineEnd && (
                    <>
                      <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                      <rect x={todayX - 1} y={4} width={28} height={14} rx={3} fill="#ef4444" />
                      <text x={todayX + 3} y={14} fontSize={10} fill="#ffffff" fontWeight="600">今日</text>
                    </>
                  )}
                </svg>
              </div>
            </div>

            {/* 下排 */}
            <div className="flex-1 min-h-0 flex overflow-hidden">

              {/* 左下 */}
              <div className="shrink-0 border-r bg-white overflow-hidden"
                style={{ width: leftWidth }} onWheel={forwardWheelToBody}>
                <div ref={leftBodyRef} style={{ willChange: 'transform' }}>
                  {filtered.map((s, i) => {
                    const status      = computeStatus(s)
                    const statusColor = STATUS_COLORS[status]
                    const evenFill = i % 2 === 0 ? '#ffffff' : '#f8fafc'
                    return (
                      <div key={s.id} className="relative border-b"
                        style={{ height: ROW_H, background: evenFill }}
                        onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                        onMouseLeave={() => setTooltip(null)}>
                        <div className="flex items-center gap-2 px-2 pt-[6px]">
                          <div className="flex-shrink-0 w-[72px] h-[24px] rounded-[5px] text-[11px] font-bold flex items-center justify-center"
                            style={{ background: statusColor.bg, color: statusColor.text, letterSpacing: '0.02em' }}>
                            {status}
                          </div>
                          <div className="min-w-0 text-[13px] font-semibold text-slate-800 truncate pr-14">
                            {s.projectName}
                          </div>
                        </div>
                        {s.taskDescription && <div className="text-[11px] text-slate-500 truncate pl-[86px] -mt-[2px]">{s.taskDescription}</div>}
                        <div className="absolute right-2 top-[10px] flex gap-1">
                          <button type="button" title="編輯" onClick={() => setEditTarget(s)}
                            className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors duration-100">
                            <Pencil size={12} strokeWidth={2.5} />
                          </button>
                          {role !== 'user' && (
                            <button type="button" title="刪除" onClick={() => setDeleteTarget(s)}
                              className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors duration-100">
                              <Trash2 size={12} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ★ 右下：Bar 區（含溢出雙色） */}
              <div ref={rightBodyRef} className="flex-1 overflow-auto" onScroll={handleRightBodyScroll}>
                <svg width={svgWidth} height={bodyHeight} className="block">
                  <rect x={0} y={0} width={svgWidth} height={bodyHeight} fill="#ffffff" />

                  {restDayBgs.map(({ x }, i) => (
                    <rect key={`rd-${i}`} x={x} y={0} width={PX_PER_DAY} height={bodyHeight} fill="rgba(0,0,0,0.085)" />
                  ))}
                  {monthLabels.map((ml, i) => (
                    <line key={`ml-${i}`} x1={ml.x} y1={0} x2={ml.x} y2={bodyHeight} stroke="#cbd5e1" strokeWidth={1} />
                  ))}

                  {filtered.map((s, i) => {
                    const y      = i * ROW_H
                    const sDate  = parseDate(s.startDate)
                    const eDate  = parseDate(s.endDate)
                    const barX   = daysBetween(timelineStart, sDate) * PX_PER_DAY
                    const totalBarDays = daysBetween(sDate, eDate) + 1
                    const barW   = Math.max(totalBarDays * PX_PER_DAY, 6)
                    const color  = getUnitColor(s.testUnit, allUnits)
                    const evenFillAlpha = i % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(248,250,252,0.5)'
                    const barY   = y + Math.floor((ROW_H - 22) / 2)

                    // ★ 溢出判定
                    const workDayOffset = getWorkDayOffset(sDate, s.timeResource, restDayConfig)
                    const hasOverflow = totalBarDays > workDayOffset && workDayOffset > 0

                    return (
                      <g key={s.id}>
                        <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={evenFillAlpha} />
                        <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" strokeWidth={1} />

                        {hasOverflow ? (
                          <>
                            {/* 前段：單位色 */}
                            <rect x={barX} y={barY}
                              width={Math.max(workDayOffset * PX_PER_DAY, 4)}
                              height={22} fill={color} rx={4}
                              style={{ cursor: 'pointer', opacity: 0.88 }}
                              onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                              onMouseLeave={() => setTooltip(null)} />
                            {/* 後段：淺綠色 */}
                            <rect x={barX + workDayOffset * PX_PER_DAY} y={barY}
                              width={Math.max((totalBarDays - workDayOffset) * PX_PER_DAY, 4)}
                              height={22} fill={OVERFLOW_COLOR} rx={4}
                              style={{ cursor: 'pointer', opacity: 0.88 }}
                              onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                              onMouseLeave={() => setTooltip(null)} />
                          </>
                        ) : (
                          <rect x={barX} y={barY} width={barW} height={22}
                            fill={color} rx={4}
                            style={{ cursor: 'pointer', opacity: 0.88 }}
                            onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                            onMouseLeave={() => setTooltip(null)} />
                        )}
                      </g>
                    )
                  })}

                  {today >= timelineStart && today <= timelineEnd && (
                    <line x1={todayX} y1={0} x2={todayX} y2={bodyHeight} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                  )}
                </svg>
              </div>
            </div>

            {/* ── 拖曳把手 ── */}
            <div
              className="absolute top-0 bottom-0 z-10 cursor-col-resize group"
              style={{ left: leftWidth - 3, width: 6 }}
              onMouseDown={handleResizeStart}
            >
              <div className="w-full h-full bg-slate-200 group-hover:bg-blue-400 transition-colors duration-150" />
            </div>
          </div>
        )
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div className="fixed z-50 pointer-events-none" style={getTooltipPosition(tooltip.x, tooltip.y)}>
          <div className="bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 max-w-xs text-sm leading-relaxed">
            <div className="font-bold text-base mb-1.5 text-white">{tooltip.s.projectName}</div>
            {tooltip.s.taskDescription && (
              <div className="text-slate-300 mb-2 text-sm">{tooltip.s.taskDescription}</div>
            )}
            <div className="space-y-0.5 text-slate-300 text-xs">
              <div><span className="text-slate-400">工作類別：</span>{tooltip.s.category}</div>
              <div><span className="text-slate-400">測試單位：</span>{tooltip.s.testUnit}</div>
              <div><span className="text-slate-400">測試人員：</span>{tooltip.s.testEngineer}</div>
              <div><span className="text-slate-400">起始／完成日期：</span>{tooltip.s.startDate} ～ {tooltip.s.endDate}</div>
              <div><span className="text-slate-400">需求人員：</span>{tooltip.s.requiredPersonnel}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ScheduleFormModal isOpen={showAddModal || !!editTarget} schedule={editTarget}
        onClose={() => { setEditTarget(null); onCloseAddModal() }} />
      <DeleteConfirmDialog isOpen={!!deleteTarget}
        message={`確定要刪除「${deleteTarget?.projectName}」嗎？此操作無法復原。`}
        onConfirm={() => { remove(deleteTarget!.id); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}