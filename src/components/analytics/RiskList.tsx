import React, { useMemo } from 'react'
import { isOverdue, daysBetweenYmd, fmtYmd } from '../../lib/analytics'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

interface RiskRow {
  s: Schedule
  kind: 'overdue' | 'upcoming'
  days: number   // overdue: 逾期天數；upcoming: 剩餘天數
}

const RiskList: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())

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

  if (rows.length === 0) {
    return <p className="text-gray-400 text-sm">目前無逾期或 7 天內到期的排程</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {rows.map(({ s, kind, days }) => (
        <div key={s.id}
          className="flex items-center gap-3 py-2 pl-3"
          style={{ borderLeft: `3px solid ${kind === 'overdue' ? '#DC2626' : '#D97706'}` }}>
          <span className="font-medium text-gray-800 min-w-[120px] truncate">{s.projectName}</span>
          <span className="text-gray-500 text-sm flex-1 truncate">
            {s.testEngineer || '-'} · {s.testUnit || '-'}
          </span>
          <span className="text-gray-500 text-sm">{s.endDate}</span>
          <span className={`text-sm font-semibold min-w-[80px] text-right ${
            kind === 'overdue' ? 'text-red-600' : 'text-amber-600'
          }`}>
            {kind === 'overdue' ? `逾期 ${days} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default RiskList
