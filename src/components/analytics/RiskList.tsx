import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { isOverdue, daysBetweenYmd, fmtYmd } from '../../lib/analytics'
import { displayYmd } from '../../lib/dateFormat'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

interface RiskRow {
  s: Schedule
  kind: 'overdue' | 'upcoming'
  days: number   // overdue: 逾期天數；upcoming: 剩餘天數
}

/**
 * 預設顯示的筆數。正式資料上這份清單超過 30 筆，全部展開會把下面的
 * 「單位執行比較」與「延遲分析」推到第三個螢幕以下，等於那兩個區塊
 * 沒有人會看到。逾期的排在最前面，所以前 10 筆就是最需要處理的 10 筆。
 */
const DEFAULT_LIMIT = 10

const RiskList: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo<RiskRow[]>(() => {
    const overdue: RiskRow[] = schedules
      .filter(s => isOverdue(s, today))
      .map(s => ({ s, kind: 'overdue' as const, days: daysBetweenYmd(s.endDate, today) }))
      .sort((a, b) => b.days - a.days)
    const upcoming: RiskRow[] = schedules
      .filter(s => {
        if (s.isCompleted || s.isCancelled) return false
        const left = daysBetweenYmd(today, s.endDate)
        return left >= 0 && left <= 7
      })
      .map(s => ({ s, kind: 'upcoming' as const, days: daysBetweenYmd(today, s.endDate) }))
      .sort((a, b) => a.days - b.days)
    return [...overdue, ...upcoming]
  }, [schedules, today])

  const overdueCount = useMemo(() => rows.filter(r => r.kind === 'overdue').length, [rows])
  const upcomingCount = rows.length - overdueCount

  if (rows.length === 0) {
    return <p className="text-gray-400 text-sm">目前無逾期或 7 天內到期的排程</p>
  }

  const visible = expanded ? rows : rows.slice(0, DEFAULT_LIMIT)
  const hidden = rows.length - visible.length

  return (
    <div className="space-y-3">
      {/* 收合時也要看得出整體規模，否則「只有 10 筆」會誤導 */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {overdueCount > 0 && (
          <span className="tnum px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
            逾期 {overdueCount}
          </span>
        )}
        {upcomingCount > 0 && (
          <span className="tnum px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
            7 天內到期 {upcomingCount}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {visible.map(({ s, kind, days }) => (
          <div key={s.id}
            className="flex items-center gap-3 py-2 pl-3"
            style={{ borderLeft: `3px solid ${kind === 'overdue' ? '#DC2626' : '#D97706'}` }}>
            <span className="font-medium text-gray-800 min-w-[120px] truncate" title={s.projectName}>
              {s.projectName}
            </span>
            <span className="text-gray-500 text-sm flex-1 truncate">
              {s.testEngineer || '-'} · {s.testUnit || '-'}
            </span>
            <span className="tnum text-gray-500 text-sm">{displayYmd(s.endDate)}</span>
            <span className={`tnum text-sm font-semibold min-w-[80px] text-right ${
              kind === 'overdue' ? 'text-red-600' : 'text-amber-600'
            }`}>
              {kind === 'overdue' ? `逾期 ${days} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`}
            </span>
          </div>
        ))}
      </div>

      {rows.length > DEFAULT_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
        >
          {expanded
            ? <>收合，只顯示前 {DEFAULT_LIMIT} 筆 <ChevronUp size={14} /></>
            : <>顯示其餘 {hidden} 筆（共 {rows.length} 筆）<ChevronDown size={14} /></>}
        </button>
      )}
    </div>
  )
}

export default RiskList
