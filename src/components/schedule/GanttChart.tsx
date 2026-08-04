import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { ShieldCheck, Bookmark, Pencil, Trash2, CalendarRange, Maximize2, Minimize2, ClipboardCopy } from 'lucide-react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { STATUS_COLORS, OVERFLOW_COLOR, STATUS_GLYPH } from '../../constants'
import { resolveUnitColor, resolveEngineerColor, readableTextColor } from '../../lib/colors'
import { computeStatus } from '../../lib/status'
import { schedulesToTsv } from '../../lib/tsv'
import { isRestDay } from '../../lib/restDays'
import { FilterSortBar, DEFAULT_FILTER, DEFAULT_SORT_RULES } from './FilterSortBar'
import { ScheduleFormModal } from './ScheduleFormModal'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { FlagPopover } from './FlagPopover'
import ScheduleListView from './ScheduleListView'
import GanttBar, { BAR_H } from './GanttBar'
import type { FilterSortState, SortRule, SortableField } from './FilterSortBar'
import type { Role, Schedule, VtmsProgress } from '../../types'
import type { ScheduleStatus } from '../../lib/status'

// ── 尺寸常數 ──────────────────────────────────────────
const LEFT_W       = 260  // 狀態籤加寬 12px（72→84），預設欄寬同步補償
const ROW_H        = 46
const HEADER_H     = 90
const HEADER_MONTH = 30
const HEADER_WEEK  = 20
const HEADER_DAY   = 40
const PX_PER_DAY   = 22

// 左欄寬度達此值才顯示完整 PDN Number；未達則只顯示編號段（如 PDN-250061）。
// 實際資料最長達 33 字元（PDN-210079 NCA-5220A-NZ1 [Nozomi]），
// 預設 260px 塞不下人員徽章、PDN 與四顆操作按鈕。
export const PDN_FULL_THRESHOLD = 340

export function pdnDisplay(projectName: string, leftWidth: number): string {
  if (leftWidth >= PDN_FULL_THRESHOLD) return projectName
  // 不含空白的舊資料沒有「編號段」可取，整串保留交由 CSS 截斷
  return projectName.split(' ')[0] || projectName
}

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
  Cancelled: 4, Completed: 0, Delayed: 1, Testing: 2, Planned: 3,
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
  role: Role | null,
  allowedUnits: string[],
  linkedEngineer: string,
): Schedule[] {
  let result = schedules.filter(s => {
    // ★ User 預設只看自己的排程（testEngineer === linkedEngineer）
    //   按下「顯示所有」後才看全部；linkedEngineer 未設定時不過濾
    if (role === 'user' && !fs.showAllUnits) {
      if (linkedEngineer && s.testEngineer !== linkedEngineer) return false
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
    if (fs.showUserFlagged  && !s.userFlag)  return false
    if (fs.showAdminFlagged && !s.adminFlag) return false
    // ★ 設備篩選：devices 為空表示不篩選（顯示全部）；非空則需命中其一。
    //   套用在此處而非只在 deviceRows，才能讓列表視圖與設備視角共用同一份 filtered 結果。
    if (fs.devices.length && !fs.devices.includes(s.device)) return false
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

// Fix 5: moved FlagPopoverState to module scope
// Fix 1: added anchorEl for fixed positioning
interface FlagPopoverState {
  scheduleId: string
  type: 'admin' | 'user'
  anchorEl: HTMLButtonElement
}

interface Props {
  showAddModal:    boolean
  onCloseAddModal: () => void
  filterCollapsed: boolean
  onToggleFilter:  () => void
}

export function GanttChart({
  showAddModal, onCloseAddModal,
  filterCollapsed, onToggleFilter,
}: Props) {
  const { schedules, remove, update } = useScheduleStore()
  const { options }           = useOptionsStore()
  const { role, allowedUnits, linkedEngineer, canViewVtmsProgress } = useAuthStore()
  const [filterSort, setFilterSort]     = useState<FilterSortState>(DEFAULT_FILTER)
  const [editTarget, setEditTarget]     = useState<Schedule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [tooltip, setTooltip]           = useState<{ x: number; y: number; s: Schedule } | null>(null)
  const [progressMap, setProgressMap]   = useState<Record<string, VtmsProgress | null>>({})

  const [flagPopover, setFlagPopover] = useState<FlagPopoverState | null>(null)
  // Fix 4: stable close handler to avoid re-registering mousedown listener
  const closeFlagPopover = useCallback(() => setFlagPopover(null), [])

  // 儲存成功但排程被目前篩選（預設隱藏 Completed）擋掉時的提示，
  // 避免使用者以為「標記完成」沒有生效
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const saveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 列表複製提示：成功時顯示筆數，讓使用者確認拿到的是完整篩選結果而非
  // 虛擬化畫面上的可視列；失敗（不安全來源／權限被拒）時顯示原因而非無聲失敗。
  const [copyNotice, setCopyNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const copyNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSaved = useCallback(({ isCompleted }: { isCompleted: boolean }) => {
    if (isCompleted && filterSort.statuses.length > 0 && !filterSort.statuses.includes('Completed')) {
      setSaveNotice('已標記為 Completed。已完成的排程目前被「狀態」篩選隱藏，勾選 Completed 即可重新顯示。')
      if (saveNoticeTimer.current) clearTimeout(saveNoticeTimer.current)
      saveNoticeTimer.current = setTimeout(() => setSaveNotice(null), 8000)
    }
  }, [filterSort.statuses])

  const [groupBy, setGroupBy] = useState<'engineer' | 'device'>(() =>
    (localStorage.getItem('vsms-gantt-group-by') as 'engineer' | 'device') ?? 'engineer'
  )

  // 視圖模式。與 filterSort 同層，因此切換時篩選與排序完全不受影響
  const [viewMode, setViewMode] = useState<'gantt' | 'list'>(() =>
    (localStorage.getItem('vsms-main-view-mode') as 'gantt' | 'list') ?? 'gantt'
  )

  // ── 全螢幕檢視 ────────────────────────────────────────
  // CSS 覆蓋整個視窗 + 嘗試瀏覽器全螢幕（失敗則僅覆蓋視窗）。
  // 彈窗／tooltip 都 portal 到 body，瀏覽器全螢幕作用在整份文件上所以照常顯示。
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(f => {
      const next = !f
      if (next) document.documentElement.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return next
    })
  }, [])
  useEffect(() => {
    // 使用者按 Esc 離開瀏覽器全螢幕時，同步關閉覆蓋模式
    const onFsChange = () => { if (!document.fullscreenElement) setIsFullscreen(false) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // 顯示偏好存 localStorage（跨登入保留）；相容舊版 sessionStorage 值
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = localStorage.getItem('ganttLeftWidth') ?? sessionStorage.getItem('ganttLeftWidth')
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
      localStorage.setItem('ganttLeftWidth', String(finalW))
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

  // ── VTMS progress fetching ────────────────────────────
  useEffect(() => {
    if (!canViewVtmsProgress) return
    const linked = schedules.filter(s => s.vtmsPlanId)
    if (linked.length === 0) return

    Promise.all(
      linked.map(s =>
        api.getScheduleVtmsProgress(s.id)
          .then(data => ({ id: s.id, data }))
          .catch(() => ({ id: s.id, data: null }))
      )
    ).then(results => {
      const map: Record<string, VtmsProgress | null> = {}
      for (const r of results) map[r.id] = r.data
      setProgressMap(map)
    })
  }, [canViewVtmsProgress, schedules])

  const rightBodyRef   = useRef<HTMLDivElement>(null)
  const rightHeaderRef = useRef<HTMLDivElement>(null)
  const leftBodyRef    = useRef<HTMLDivElement>(null)
  const rafRef         = useRef<number | null>(null)

  // ── 列虛擬化（工程師視角）───────────────────────────────
  // 只渲染可視範圍 ± 緩衝的列；範圍索引不預先夾限，交由 slice 自然截斷
  const VIRTUAL_BUFFER = 10
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 })
  const updateVisibleRange = useCallback(() => {
    const el = rightBodyRef.current
    if (!el) return
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - VIRTUAL_BUFFER)
    const end = Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + VIRTUAL_BUFFER
    setVisibleRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    window.addEventListener('resize', updateVisibleRange)
    return () => window.removeEventListener('resize', updateVisibleRange)
  }, [updateVisibleRange])

  // viewMode（甘特圖／列表）或 groupBy（工程師／設備）切換時，甘特圖主體會卸載
  // 再重新掛載一個全新的捲動容器（scrollTop 重置為 0），但 visibleRange 是元件層級
  // state，不會跟著卸載重置。若不同步重算，殘留的舊可視範圍會撐出比實際內容還高的
  // spacer，導致切回甘特圖時整片空白，需使用者手動捲動觸發 handleRightBodyScroll
  // 才會自我修正。用 useLayoutEffect 在瀏覽器繪製前同步重算，避免這一格空白閃現。
  useLayoutEffect(() => {
    updateVisibleRange()
  }, [viewMode, groupBy, updateVisibleRange])

  useEffect(() => {
    // 全螢幕切換會改變容器高度，重算虛擬化可視範圍
    const raf = requestAnimationFrame(updateVisibleRange)
    if (!isFullscreen) return () => cancelAnimationFrame(raf)
    // 瀏覽器全螢幕被拒（僅覆蓋模式）時以 Esc 離開；有彈窗開啟時讓彈窗優先
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.fullscreenElement) return
      if (editTarget || deleteTarget || flagPopover || showAddModal) return
      setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey) }
  }, [isFullscreen, editTarget, deleteTarget, flagPopover, showAddModal, updateVisibleRange])

  const filtered  = applyFilter(schedules, filterSort, role, allowedUnits, linkedEngineer)
  // guest 唯讀：所有寫入操作（旗標/編輯/刪除）一律隱藏
  const canWrite  = role === 'super_admin' || role === 'admin'

  // 從 options 建立 testEngineer value → 顯示名稱（label）的對照表
  const engineerLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const unit of options.testUnits) {
      for (const eng of unit.engineers) {
        map.set(eng.value, eng.label)
      }
    }
    return map
  }, [options.testUnits])

  const engLabel = (value: string) => engineerLabelMap.get(value) ?? value

  // 列表模式「複製表格」：把「當前 filtered 陣列的全部資料」（非可視列）轉為
  // TSV 寫入剪貼簿，這是它存在的唯一理由——虛擬化只渲染可視列 ± 緩衝，若照
  // DOM 內容複製，篩選出的 599 筆會只拿到畫面上那 20～30 列且不會有任何警示。
  const handleCopyList = async () => {
    if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current)

    if (filtered.length === 0) {
      setCopyNotice({ kind: 'error', text: '沒有可複製的資料' })
    } else {
      try {
        // 轉換也放在 try 內：需求要求任何失敗都要看得見，不能只守剪貼簿那一段
        const tsv = schedulesToTsv(filtered, engLabel)
        await navigator.clipboard.writeText(tsv)
        setCopyNotice({ kind: 'success', text: `已複製 ${filtered.length} 筆到剪貼簿` })
      } catch {
        // navigator.clipboard.writeText 在非安全來源（非 HTTPS/localhost）或權限被拒時會 reject，
        // 需求明確要求「顯示提示而非無聲失敗」
        setCopyNotice({ kind: 'error', text: '複製失敗，請確認瀏覽器剪貼簿權限或改用 HTTPS 連線' })
      }
    }
    copyNoticeTimer.current = setTimeout(() => setCopyNotice(null), 4000)
  }

  // ── 設備視角 rows ──────────────────────────────────────
  const deviceRows = useMemo(() => {
    if (groupBy !== 'device') return []
    const allDevices = (options.devices ?? [])
      .filter(d => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const activeDeviceValues = filterSort.devices.length > 0
      ? filterSort.devices
      : allDevices.map(d => d.value)
    return allDevices
      .filter(d => activeDeviceValues.includes(d.value))
      .map(d => ({
        device: d,
        schedules: filtered.filter(s => s.device === d.value),
      }))
  }, [groupBy, options.devices, filtered, filterSort.devices])

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
    // Fix 5: close flag popover on right panel scroll so it doesn't drift
    closeFlagPopover()
    if (!rightBodyRef.current) return
    const { scrollLeft, scrollTop } = rightBodyRef.current
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (rightHeaderRef.current) rightHeaderRef.current.scrollLeft = scrollLeft
      if (leftBodyRef.current) leftBodyRef.current.style.transform = `translateY(-${scrollTop}px)`
      updateVisibleRange()
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
    // 今日在時間軸範圍內就置中（含預設 −1m~+6m 範圍），否則捲到範圍起點
    if (today >= timelineStart && today <= timelineEnd) {
      const todayX = daysBetween(timelineStart, today) * PX_PER_DAY
      rightBodyRef.current.scrollLeft = todayX - rightBodyRef.current.clientWidth / 2
    } else {
      rightBodyRef.current.scrollLeft = 0
    }
    handleRightBodyScroll()
    // viewMode/groupBy 也要重新觸發：切換視圖會掛載全新的捲動容器（scrollLeft 重置為
    // 0），若不把它們列為 deps，回到甘特圖時就不會重新置中今日，停在 scrollLeft: 0。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSort.ganttStart, filterSort.ganttEnd, viewMode, groupBy])

  // ── 空資料 ────────────────────────────────────────────
  if (schedules.length === 0) {
    return (
      <>
        <FilterSortBar value={filterSort} onChange={setFilterSort}
          collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
          role={role} groupBy={groupBy} />
        <div className="flex-1 flex items-center justify-center bg-white rounded-lg shadow m-4">
          <div className="text-center text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-base font-medium text-gray-500">尚無工作排程</p>
            <p className="text-sm text-gray-400 mt-1">點擊右上角「＋ 新增排程」開始建立</p>
          </div>
        </div>
        <ScheduleFormModal isOpen={showAddModal} schedule={null} onSaved={handleSaved} onClose={onCloseAddModal} />
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
    <div className={`flex flex-col bg-white overflow-hidden ${
      isFullscreen ? 'fixed inset-0 z-[100]' : 'h-full rounded-lg shadow'
    }`}>
      <FilterSortBar value={filterSort} onChange={setFilterSort}
        collapsed={filterCollapsed} onToggleCollapse={onToggleFilter}
        role={role} groupBy={groupBy} />

      {/* ── 圖例 ── */}
      <div className="flex-shrink-0 flex flex-wrap gap-4 px-4 py-2.5 border-b bg-slate-50">
        {options.testUnits.filter(u => u.isActive).map(u => (
          <span key={u.id} className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0 bg-transparent"
              style={{ border: `2px solid ${resolveUnitColor(u.value, options)}` }} />
            {u.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
          <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0"
            style={{ background: OVERFLOW_COLOR }} />
          超出時間資源
        </span>
        <span className="text-xs text-gray-500 self-center">
          外框為測試單位，內裡為測試人員
        </span>
      </div>

      {/* ── 甘特圖控制列 ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2
                   bg-slate-50 border-b hover:bg-slate-100 transition-colors duration-150 select-none"
      >
        <div className="flex items-center gap-2">
          {/* 視圖切換：甘特圖 / 列表 */}
          <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium"
            onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setViewMode('gantt'); localStorage.setItem('vsms-main-view-mode', 'gantt') }}
              className={`px-2.5 py-1 transition-colors ${
                viewMode === 'gantt' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              甘特圖
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('list'); localStorage.setItem('vsms-main-view-mode', 'list') }}
              className={`px-2.5 py-1 transition-colors border-l border-slate-300 ${
                viewMode === 'list' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              列表
            </button>
          </div>
          {hasGanttRange && viewMode === 'gantt' && (
            <span className="flex items-center gap-1 text-xs text-blue-600
                             bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              <CalendarRange size={11} />
              {filterSort.ganttStart || '最早'} ～ {filterSort.ganttEnd || '最晚'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* ★ 分組切換按鈕：列表模式下沒有分組概念，隱藏 */}
          {viewMode === 'gantt' && (
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs font-medium"
              onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setGroupBy('engineer')
                  localStorage.setItem('vsms-gantt-group-by', 'engineer')
                }}
                className={`px-2.5 py-1 transition-colors ${
                  groupBy === 'engineer'
                    ? 'bg-slate-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                按工程師
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupBy('device')
                  localStorage.setItem('vsms-gantt-group-by', 'device')
                }}
                className={`px-2.5 py-1 transition-colors border-l border-slate-300 ${
                  groupBy === 'device'
                    ? 'bg-slate-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                按設備
              </button>
            </div>
          )}
          {/* ★ 複製表格：僅列表模式顯示，複製的是 filtered 全部資料而非畫面上的可視列 */}
          {viewMode === 'list' && (
            <button
              type="button"
              title="複製目前篩選結果的完整列表（TSV，可直接貼到 Excel）"
              onClick={e => { e.stopPropagation(); handleCopyList() }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white
                         text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <ClipboardCopy size={13} />
              複製表格
            </button>
          )}
          {/* ★ 全螢幕切換 */}
          <button
            type="button"
            title={isFullscreen ? '離開全螢幕（Esc）' : '全螢幕檢視甘特圖'}
            onClick={e => { e.stopPropagation(); toggleFullscreen() }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white
                       text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {isFullscreen ? '離開全螢幕' : '全螢幕'}
          </button>
        </div>
      </div>

      {/* ══ 甘特圖主體（四象限凍結窗格）／列表主體 ══ */}
      {viewMode === 'list' ? (
        <ScheduleListView
          schedules={filtered}
          role={role}
          linkedEngineer={linkedEngineer}
          engLabel={engLabel}
          options={options}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
      ) : (
        groupBy === 'device' ? (
          // ── 設備視角 ──────────────────────────────────────────
          deviceRows.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">尚無設備，請至設定頁新增</div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
              {/* 上排 Header */}
              <div className="flex-shrink-0 flex" style={{ height: HEADER_H }}>
                <div className="shrink-0 border-r relative"
                  style={{ width: leftWidth, height: HEADER_H }} onWheel={forwardWheelToBody}>
                  <svg width={leftWidth} height={HEADER_H} className="block">
                    <rect x={0} y={0} width={leftWidth} height={HEADER_H} fill="#e2e8f0" />
                    <text x={12} y={HEADER_MONTH / 2 + 6} fontSize={13} fill="#334155" fontWeight="700">設備視角</text>
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
                    {monthLabels.map((ml) => (
                      <g key={ml.label}>
                        <line x1={ml.x} y1={0} x2={ml.x} y2={HEADER_H} stroke="#cbd5e1" strokeWidth={1} />
                        <text x={ml.x + 5} y={HEADER_MONTH / 2 + 6} fontSize={12} fill="#334155" fontWeight="700">{ml.label}</text>
                      </g>
                    ))}
                    {weekTicks.map((t) => (
                      <g key={t.label}>
                        <line x1={t.x} y1={HEADER_MONTH} x2={t.x} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                        <text x={t.x + 2} y={HEADER_MONTH + HEADER_WEEK / 2 + 5} fontSize={11} fill="#64748b" fontWeight="600">{t.label}</text>
                      </g>
                    ))}
                    {dayLabelItems.map((d) => (
                      <g key={`day-${d.x}`}>
                        {/* 休息日以淡灰底標示（紅色保留給今日線與 Delayed） */}
                        {d.isRest && (
                          <rect x={d.x} y={HEADER_MONTH + HEADER_WEEK} width={PX_PER_DAY} height={HEADER_DAY}
                            fill="rgba(100,116,139,0.14)" />
                        )}
                        <line x1={d.x} y1={HEADER_MONTH + HEADER_WEEK} x2={d.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={0.5} />
                        {PX_PER_DAY >= 16 && (
                          <text x={d.x + PX_PER_DAY / 2} y={HEADER_MONTH + HEADER_WEEK + HEADER_DAY / 2 + 5}
                            fontSize={11} fill="#64748b" textAnchor="middle"
                            fontWeight={d.isRest ? '700' : '400'}>{d.label}</text>
                        )}
                      </g>
                    ))}
                    {today >= timelineStart && today <= timelineEnd && (
                      <>
                        <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                        <rect x={todayX - 1} y={4} width={32} height={16} rx={3} fill="#ef4444" />
                        <text x={todayX + 3} y={16} fontSize={11} fill="#ffffff" fontWeight="600">今日</text>
                      </>
                    )}
                  </svg>
                </div>
              </div>

              {/* 下排 */}
              <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* 左下：設備名稱列 */}
                <div className="shrink-0 border-r bg-white overflow-hidden"
                  style={{ width: leftWidth }} onWheel={forwardWheelToBody}>
                  <div ref={leftBodyRef} style={{ willChange: 'transform' }}>
                    {deviceRows.map(({ device: dev, schedules: devSchedules }, i) => {
                      const evenFill = i % 2 === 0 ? '#fafbfc' : '#f1f5f9'
                      return (
                        <div key={dev.id} className="relative border-b flex items-center px-3"
                          style={{ height: ROW_H, background: evenFill }}>
                          <span className="text-[13px] font-semibold text-slate-800">{dev.label}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            {devSchedules.length > 0 ? `${devSchedules.length} 筆` : '（空）'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 右下：Bar 區 */}
                <div ref={rightBodyRef} className="flex-1 overflow-auto" onScroll={handleRightBodyScroll}>
                  <svg width={svgWidth} height={deviceRows.length * ROW_H} className="block">
                    <rect x={0} y={0} width={svgWidth} height={deviceRows.length * ROW_H} fill="#fafbfc" />
                    {restDayBgs.map(({ x }) => (
                      <rect key={`rd-${x}`} x={x} y={0} width={PX_PER_DAY} height={deviceRows.length * ROW_H} fill="rgba(0,0,0,0.085)" />
                    ))}
                    {monthLabels.map((ml) => (
                      <line key={`ml-${ml.x}`} x1={ml.x} y1={0} x2={ml.x} y2={deviceRows.length * ROW_H} stroke="#cbd5e1" strokeWidth={1} />
                    ))}
                    {deviceRows.map(({ device: dev, schedules: devSchedules }, rowIdx) => {
                      const y = rowIdx * ROW_H
                      const evenFillAlpha = rowIdx % 2 === 0 ? 'rgba(250,251,252,0.5)' : 'rgba(241,245,249,0.5)'
                      return (
                        <g key={dev.id}>
                          <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={evenFillAlpha} />
                          <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" strokeWidth={1} />
                          {devSchedules.map((s) => {
                            const sDate = parseDate(s.startDate)
                            const eDate = parseDate(s.endDate)
                            const barX = daysBetween(timelineStart, sDate) * PX_PER_DAY
                            const totalBarDays = daysBetween(sDate, eDate) + 1
                            const barW = Math.max(totalBarDays * PX_PER_DAY, 6)
                            const unitColor = resolveUnitColor(s.testUnit, options)
                            const engColor  = s.testEngineer
                              ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                              : unitColor
                            const barY = y + Math.floor((ROW_H - BAR_H) / 2)
                            const workDayOffset = getWorkDayOffset(sDate, s.timeResource, restDayConfig)
                            const hasOverflow = totalBarDays > workDayOffset && workDayOffset > 0
                            const overflowX = barX + workDayOffset * PX_PER_DAY
                            return (
                              <g key={s.id}>
                                {/* 設備視角的左欄是設備名稱，bar 上的人名是此視角唯一的人員線索，
                                    因此傳入 label（工程師視角已由左欄徽章提供，故傳 null）。 */}
                                <GanttBar
                                  barX={barX} barW={barW} barY={barY}
                                  unitColor={unitColor} engColor={engColor}
                                  overflowStartX={hasOverflow ? overflowX : null}
                                  label={engLabel(s.testEngineer)}
                                  clipId={`bc-dev-${s.id}`}
                                  onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                                  onMouseLeave={() => setTooltip(null)} />
                              </g>
                            )
                          })}
                          {today >= timelineStart && today <= timelineEnd && (
                            <line x1={todayX} y1={y} x2={todayX} y2={y + ROW_H} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                          )}
                        </g>
                      )
                    })}
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
        ) : (
        // ── 工程師視角 ──────────────────────────────────────────
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

                  {monthLabels.map((ml) => (
                    <g key={ml.label}>
                      <line x1={ml.x} y1={0} x2={ml.x} y2={HEADER_H} stroke="#cbd5e1" strokeWidth={1} />
                      <text x={ml.x + 5} y={HEADER_MONTH / 2 + 6} fontSize={12} fill="#334155" fontWeight="700">{ml.label}</text>
                    </g>
                  ))}
                  {weekTicks.map((t) => (
                    <g key={t.label}>
                      <line x1={t.x} y1={HEADER_MONTH} x2={t.x} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
                      <text x={t.x + 2} y={HEADER_MONTH + HEADER_WEEK / 2 + 5} fontSize={11} fill="#64748b" fontWeight="600">{t.label}</text>
                    </g>
                  ))}
                  {dayLabelItems.map((d) => (
                    <g key={`day-${d.x}`}>
                      {/* 休息日以淡灰底標示（紅色保留給今日線與 Delayed） */}
                      {d.isRest && (
                        <rect x={d.x} y={HEADER_MONTH + HEADER_WEEK} width={PX_PER_DAY} height={HEADER_DAY}
                          fill="rgba(100,116,139,0.14)" />
                      )}
                      <line x1={d.x} y1={HEADER_MONTH + HEADER_WEEK} x2={d.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth={0.5} />
                      {PX_PER_DAY >= 16 && (
                        <text x={d.x + PX_PER_DAY / 2} y={HEADER_MONTH + HEADER_WEEK + HEADER_DAY / 2 + 5}
                          fontSize={11} fill="#64748b" textAnchor="middle"
                          fontWeight={d.isRest ? '700' : '400'}>{d.label}</text>
                      )}
                    </g>
                  ))}
                  {today >= timelineStart && today <= timelineEnd && (
                    <>
                      <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
                      <rect x={todayX - 1} y={4} width={32} height={16} rx={3} fill="#ef4444" />
                      <text x={todayX + 3} y={16} fontSize={11} fill="#ffffff" fontWeight="600">今日</text>
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
                  {/* 虛擬化：以 spacer 撐住捲動位移，只渲染可視列 */}
                  {visibleRange.start > 0 && <div style={{ height: visibleRange.start * ROW_H }} />}
                  {filtered.slice(visibleRange.start, visibleRange.end).map((s, sliceIdx) => {
                    const i = visibleRange.start + sliceIdx
                    const status      = computeStatus(s)
                    const statusColor = STATUS_COLORS[status]
                    const evenFill = i % 2 === 0 ? '#fafbfc' : '#f1f5f9'
                    const engColor = s.testEngineer
                      ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                      : '#e2e8f0'
                    const engTextColor = s.testEngineer ? readableTextColor(engColor) : '#64748b'
                    return (
                      <div key={s.id} className="relative border-b"
                        style={{ height: ROW_H, background: evenFill }}>

                        {/* 第一行：人員徽章 → PDN Number → 操作按鈕 */}
                        <div className="flex items-center gap-1.5 px-2 pt-[5px]">
                          <span
                            className="flex-shrink-0 h-5 px-[7px] rounded-[5px] text-xs font-bold flex items-center"
                            style={{ background: engColor, color: engTextColor }}
                            title={s.testEngineer ? engLabel(s.testEngineer) : '未指派測試人員'}>
                            {s.testEngineer ? engLabel(s.testEngineer) : '未指派'}
                          </span>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-slate-800 truncate"
                            title={s.projectName}>
                            {pdnDisplay(s.projectName, leftWidth)}
                          </span>

                          <div className="flex-shrink-0 flex gap-[3px]">
                            {/* Admin 旗標（Admin/SA 限定） */}
                            {canWrite && (
                              <div className="relative">
                                <button
                                  type="button"
                                  title={s.adminFlag ? (s.adminFlagNote || 'Admin 旗標已標記') : '設定 Admin 旗標'}
                                  onClick={(e) => {
                                    if (flagPopover?.scheduleId === s.id && flagPopover.type === 'admin') {
                                      setFlagPopover(null)
                                    } else {
                                      setFlagPopover({ scheduleId: s.id, type: 'admin', anchorEl: e.currentTarget })
                                    }
                                  }}
                                  className={`w-[19px] h-[19px] flex items-center justify-center rounded-[5px] transition-colors duration-100
                                    ${s.adminFlag
                                      ? 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:text-orange-500 hover:bg-orange-50 hover:border-orange-300'
                                    }`}
                                >
                                  <ShieldCheck size={12} strokeWidth={2.2} />
                                </button>
                                {flagPopover?.scheduleId === s.id && flagPopover.type === 'admin' && (
                                  <FlagPopover
                                    flagged={s.adminFlag ?? false}
                                    note={s.adminFlagNote ?? ''}
                                    color="orange"
                                    anchorEl={flagPopover.anchorEl}
                                    onClose={closeFlagPopover}
                                    onSave={async (note) => {
                                      await update(s.id, { adminFlag: true, adminFlagNote: note })
                                      setFlagPopover(null)
                                    }}
                                    onRemove={async () => {
                                      await update(s.id, { adminFlag: false, adminFlagNote: '' })
                                      setFlagPopover(null)
                                    }}
                                  />
                                )}
                              </div>
                            )}

                            {/* 使用者旗標（登入帳號皆可，guest 唯讀不可） */}
                            {role !== 'guest' && (
                              <div className="relative">
                                <button
                                  type="button"
                                  title={s.userFlag ? (s.userFlagNote || '旗標已標記') : '設定旗標'}
                                  onClick={(e) => {
                                    if (flagPopover?.scheduleId === s.id && flagPopover.type === 'user') {
                                      setFlagPopover(null)
                                    } else {
                                      setFlagPopover({ scheduleId: s.id, type: 'user', anchorEl: e.currentTarget })
                                    }
                                  }}
                                  className={`w-[19px] h-[19px] flex items-center justify-center rounded-[5px] transition-colors duration-100
                                    ${s.userFlag
                                      ? 'bg-blue-500 text-white shadow-sm ring-1 ring-blue-600/30 hover:bg-blue-600'
                                      : 'bg-white text-gray-400 border border-gray-200 hover:text-blue-500 hover:bg-blue-50 hover:border-blue-300'
                                    }`}
                                >
                                  <Bookmark size={12} strokeWidth={2.2} fill={s.userFlag ? 'currentColor' : 'none'} />
                                </button>
                                {flagPopover?.scheduleId === s.id && flagPopover.type === 'user' && (
                                  <FlagPopover
                                    flagged={s.userFlag ?? false}
                                    note={s.userFlagNote ?? ''}
                                    color="blue"
                                    anchorEl={flagPopover.anchorEl}
                                    onClose={closeFlagPopover}
                                    onSave={async (note) => {
                                      await update(s.id, { userFlag: true, userFlagNote: note })
                                      setFlagPopover(null)
                                    }}
                                    onRemove={async () => {
                                      await update(s.id, { userFlag: false, userFlagNote: '' })
                                      setFlagPopover(null)
                                    }}
                                  />
                                )}
                              </div>
                            )}

                            {/* 編輯按鈕：user 只能編輯指派給自己的排程；guest 不可編輯 */}
                            {(canWrite || (role === 'user' && s.testEngineer === linkedEngineer)) && (
                              <button type="button" title="編輯" onClick={() => setEditTarget(s)}
                                className="w-[19px] h-[19px] flex items-center justify-center rounded-[5px] bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors duration-100">
                                <Pencil size={11} strokeWidth={2.5} />
                              </button>
                            )}
                            {canWrite && (
                              <button type="button" title="刪除" onClick={() => setDeleteTarget(s)}
                                className="w-[19px] h-[19px] flex items-center justify-center rounded-[5px] bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors duration-100">
                                <Trash2 size={11} strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 第二行：狀態籤 → 工作內容。狀態籤在此，故此行必須恆常渲染 */}
                        <div className="flex items-center gap-1.5 px-2 pt-[2px]">
                          <span
                            className="flex-shrink-0 h-[17px] px-1.5 rounded text-[11px] font-bold flex items-center"
                            style={{ background: statusColor.bg, color: statusColor.text, letterSpacing: '0.02em' }}>
                            {STATUS_GLYPH[status]} {status}
                          </span>
                          <span className="min-w-0 text-[11px] text-slate-500 truncate"
                            title={s.taskDescription}>
                            {s.taskDescription}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ★ 右下：Bar 區（含溢出雙色） */}
              <div ref={rightBodyRef} className="flex-1 overflow-auto" onScroll={handleRightBodyScroll}>
                <svg width={svgWidth} height={bodyHeight} className="block">
                  <rect x={0} y={0} width={svgWidth} height={bodyHeight} fill="#fafbfc" />

                  {restDayBgs.map(({ x }) => (
                    <rect key={`rd-${x}`} x={x} y={0} width={PX_PER_DAY} height={bodyHeight} fill="rgba(0,0,0,0.085)" />
                  ))}
                  {monthLabels.map((ml) => (
                    <line key={`ml-${ml.x}`} x1={ml.x} y1={0} x2={ml.x} y2={bodyHeight} stroke="#cbd5e1" strokeWidth={1} />
                  ))}

                  {/* 虛擬化：座標為絕對定位（y = i × ROW_H），非可視列直接略過 */}
                  {filtered.slice(visibleRange.start, visibleRange.end).map((s, sliceIdx) => {
                    const i      = visibleRange.start + sliceIdx
                    const y      = i * ROW_H
                    const sDate  = parseDate(s.startDate)
                    const eDate  = parseDate(s.endDate)
                    const barX   = daysBetween(timelineStart, sDate) * PX_PER_DAY
                    const totalBarDays = daysBetween(sDate, eDate) + 1
                    const barW   = Math.max(totalBarDays * PX_PER_DAY, 6)
                    const unitColor = resolveUnitColor(s.testUnit, options)
                    const engColor  = s.testEngineer
                      ? resolveEngineerColor(s.testEngineer, s.testUnit, options)
                      : unitColor
                    const evenFillAlpha = i % 2 === 0 ? 'rgba(250,251,252,0.5)' : 'rgba(241,245,249,0.5)'
                    const barY   = y + Math.floor((ROW_H - BAR_H) / 2)

                    // ★ 溢出判定
                    const workDayOffset = getWorkDayOffset(sDate, s.timeResource, restDayConfig)
                    const hasOverflow = totalBarDays > workDayOffset && workDayOffset > 0

                    return (
                      <g key={s.id}>
                        <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={evenFillAlpha} />
                        <line x1={0} y1={y + ROW_H} x2={svgWidth} y2={y + ROW_H} stroke="#e2e8f0" strokeWidth={1} />
                        <GanttBar
                          barX={barX} barW={barW} barY={barY}
                          unitColor={unitColor} engColor={engColor}
                          overflowStartX={hasOverflow ? barX + workDayOffset * PX_PER_DAY : null}
                          label={null}
                          clipId={`bc-${s.id}`}
                          onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, s })}
                          onMouseLeave={() => setTooltip(null)} />
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
        )
      )}

      {/* ── Tooltip ── */}
      {tooltip && !flagPopover && (
        <div className="fixed z-50 pointer-events-none" style={getTooltipPosition(tooltip.x, tooltip.y)}>
          <div className="bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 max-w-xs text-sm leading-relaxed">
            <div className="font-bold text-base mb-1.5 text-white">{tooltip.s.projectName}</div>
            {tooltip.s.taskDescription && (
              <div className="text-slate-300 mb-2 text-sm">{tooltip.s.taskDescription}</div>
            )}
            <div className="space-y-0.5 text-slate-300 text-xs">
              <div><span className="text-slate-400">工作類別：</span>{tooltip.s.category}</div>
              <div><span className="text-slate-400">測試單位：</span>{tooltip.s.testUnit}</div>
              <div><span className="text-slate-400">測試人員：</span>{engLabel(tooltip.s.testEngineer)}</div>
              <div><span className="text-slate-400">起始／完成日期：</span>{tooltip.s.startDate} ～ {tooltip.s.endDate}</div>
              <div><span className="text-slate-400">需求人員：</span>{tooltip.s.requiredPersonnel}</div>
            </div>
            {canViewVtmsProgress && tooltip.s.vtmsPlanId && progressMap[tooltip.s.id] && (
              <div className="mt-2 pt-2 border-t border-slate-600 text-xs">
                <div className="text-slate-400 mb-1">VTMS 測試進度</div>
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="font-semibold text-white">{progressMap[tooltip.s.id]!.completionPct}%</span>
                  <span className="text-green-400">✓{progressMap[tooltip.s.id]!.results.pass}</span>
                  <span className="text-red-400">✗{progressMap[tooltip.s.id]!.results.fail}</span>
                  {progressMap[tooltip.s.id]!.results.blocked > 0 && (
                    <span className="text-orange-400">⊘{progressMap[tooltip.s.id]!.results.blocked}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ScheduleFormModal isOpen={showAddModal || !!editTarget} schedule={editTarget}
        onSaved={handleSaved}
        onClose={() => { setEditTarget(null); onCloseAddModal() }} />
      {saveNotice && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 text-sm font-medium
                        bg-blue-50 border border-blue-200 text-blue-800 rounded-xl shadow-xl
                        min-w-[260px] max-w-[420px]">
          <span>✅ {saveNotice}</span>
          <button type="button" onClick={() => setSaveNotice(null)}
            className="ml-auto text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}
      {copyNotice && (
        <div className={`fixed top-20 right-4 z-50 flex items-center gap-2 px-5 py-3 text-sm font-medium
                        rounded-xl shadow-xl min-w-[260px] max-w-[420px] ${
                          copyNotice.kind === 'success'
                            ? 'bg-green-50 border border-green-200 text-green-800'
                            : 'bg-red-50 border border-red-200 text-red-800'
                        }`}>
          <span>{copyNotice.kind === 'success' ? '✅' : '⚠️'} {copyNotice.text}</span>
          <button type="button" onClick={() => setCopyNotice(null)}
            className={`ml-auto ${copyNotice.kind === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'}`}>✕</button>
        </div>
      )}
      <DeleteConfirmDialog isOpen={!!deleteTarget}
        message={`確定要刪除「${deleteTarget?.projectName}」嗎？此操作無法復原。`}
        onConfirm={() => { remove(deleteTarget!.id); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}