// src/components/schedule/ScheduleListView.tsx
// 管理介面的列表視圖。欄位沿用匯出 dashboard 的十欄再加一欄操作，
// 資料來源與甘特圖相同（皆為 GanttChart 篩選排序後的結果），因此切換視圖
// 不會改變當下的篩選條件。
import { useRef, useState, useCallback, useEffect } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { computeStatus } from '../../lib/status'
import { STATUS_COLORS } from '../../constants'
import { resolveUnitColor, readableTextColor } from '../../lib/colors'
import { STATUS_GLYPH } from './GanttChart'
import type { Schedule, Role, OptionsMap } from '../../types'

const LIST_ROW_H = 36
const VIRTUAL_BUFFER = 10

// 純函式：把（可能過期的）可視範圍收斂到目前列數之內。
// 篩選條件縮小 schedules 後，舊的 start/end 可能整段落在新列表之外，
// 若不收斂會讓 padTop 撐出一大段空白（詳見本檔案的測試）。
export function clampRange(
  range: { start: number; end: number },
  rowCount: number,
): { start: number; end: number } {
  if (rowCount <= 0) return { start: 0, end: 0 }
  const end = Math.min(range.end, rowCount)
  const start = Math.min(Math.max(0, range.start), end)
  return { start, end }
}

interface Props {
  schedules: Schedule[]
  role: Role | null
  linkedEngineer: string
  engLabel: (value: string) => string
  options: OptionsMap
  onEdit: (s: Schedule) => void
  onDelete: (s: Schedule) => void
}

const HEADERS = [
  '狀態', '工作類別', 'PDN Number', '工作內容', '測試單位', '測試人員',
  '起始日', '完成日', '需求人員', '測試報告', '操作',
]

export default function ScheduleListView({
  schedules, role, linkedEngineer, engLabel, options, onEdit, onDelete,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 60 })
  const canWrite = role === 'super_admin' || role === 'admin'

  const updateVisibleRange = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const start = Math.max(0, Math.floor(el.scrollTop / LIST_ROW_H) - VIRTUAL_BUFFER)
    const end = Math.ceil((el.scrollTop + el.clientHeight) / LIST_ROW_H) + VIRTUAL_BUFFER
    setVisibleRange(prev => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    updateVisibleRange()
    window.addEventListener('resize', updateVisibleRange)
    return () => window.removeEventListener('resize', updateVisibleRange)
  }, [updateVisibleRange])

  // 篩選條件改變列數時（例如從 1000 列篩到 10 列），舊的 scrollTop 可能已經
  // 超出新內容的高度，讓使用者停在一片空白裡且不會自行更新。這裡把捲動位置
  // 收回新內容範圍內，並重新計算可視範圍。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScrollTop = Math.max(0, schedules.length * LIST_ROW_H - el.clientHeight)
    if (el.scrollTop > maxScrollTop) {
      el.scrollTop = maxScrollTop
    }
    updateVisibleRange()
  }, [schedules.length, updateVisibleRange])

  if (schedules.length === 0) {
    return <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
  }

  // 即使上面的 effect 還沒跑到，render 當下也不能讓過期的 visibleRange
  // 產生超出實際列數的 padTop/padBottom（哪怕只是一個 frame）。
  const { start: rangeStart, end: rangeEnd } = clampRange(visibleRange, schedules.length)
  const visible = schedules.slice(rangeStart, rangeEnd)
  const padTop = rangeStart * LIST_ROW_H
  const padBottom = Math.max(0, (schedules.length - rangeEnd) * LIST_ROW_H)

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto" onScroll={updateVisibleRange}>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100">
            {HEADERS.map(h => (
              <th key={h} className="text-left font-semibold text-slate-600 px-2 py-2 border-b border-slate-300 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={HEADERS.length} /></tr>}
          {visible.map((s, sliceIdx) => {
            const i = rangeStart + sliceIdx
            const status = computeStatus(s)
            const statusColor = STATUS_COLORS[status]
            const unitColor = resolveUnitColor(s.testUnit, options)
            const canEdit = canWrite || (role === 'user' && s.testEngineer === linkedEngineer)
            return (
              <tr key={s.id}
                className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                style={{ height: LIST_ROW_H }}>
                <td className="px-2 whitespace-nowrap">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                    style={{ background: statusColor.bg, color: statusColor.text }}>
                    {STATUS_GLYPH[status]} {status}
                  </span>
                </td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.category}</td>
                <td className="px-2 max-w-[220px] truncate font-semibold text-slate-800" title={s.projectName}>
                  {s.projectName}
                </td>
                <td className="px-2 max-w-[280px] truncate text-slate-600" title={s.taskDescription}>
                  {s.taskDescription || '—'}
                </td>
                <td className="px-2 whitespace-nowrap">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                    style={{ background: unitColor, color: readableTextColor(unitColor) }}>
                    {s.testUnit}
                  </span>
                </td>
                <td className="px-2 whitespace-nowrap text-slate-700">{engLabel(s.testEngineer)}</td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.startDate}</td>
                <td className="px-2 whitespace-nowrap text-slate-600">{s.endDate}</td>
                <td className="px-2 max-w-[160px] truncate text-slate-600" title={s.requiredPersonnel}>
                  {s.requiredPersonnel || '—'}
                </td>
                <td className="px-2 max-w-[180px] truncate text-slate-600" title={s.testReport}>
                  {s.testReport || '—'}
                </td>
                <td className="px-2 whitespace-nowrap">
                  <div className="flex gap-1">
                    {canEdit && (
                      <button type="button" title="編輯" onClick={() => onEdit(s)}
                        className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Pencil size={12} strokeWidth={2.5} />
                      </button>
                    )}
                    {canWrite && (
                      <button type="button" title="刪除" onClick={() => onDelete(s)}
                        className="w-[22px] h-[22px] flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100">
                        <Trash2 size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={HEADERS.length} /></tr>}
        </tbody>
      </table>
    </div>
  )
}
