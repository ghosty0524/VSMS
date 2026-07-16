import React from 'react'
import { statusCounts, dueCompletionRate, isOverdue, fmtYmd } from '../../lib/analytics'
import type { Schedule } from '../../types'

const CHIPS: { key: 'Planned' | 'Testing' | 'Completed' | 'Delayed' | 'Cancelled'; label: string; cls: string }[] = [
  { key: 'Planned',   label: '計畫中', cls: 'bg-gray-100 text-gray-600' },
  { key: 'Testing',   label: '進行中', cls: 'bg-blue-50 text-blue-700' },
  { key: 'Completed', label: '已完成', cls: 'bg-green-50 text-green-700' },
  { key: 'Delayed',   label: '延遲中', cls: 'bg-red-50 text-red-700' },
  { key: 'Cancelled', label: '已取消', cls: 'bg-gray-900 text-white' },
]

interface Props { schedules: Schedule[] }

const KpiSection: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())
  const counts = statusCounts(schedules)
  const overdue = schedules.filter(s => isOverdue(s, today)).length
  const dc = dueCompletionRate(schedules, today)
  const total = schedules.length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map(c => (
          <span key={c.key} className={`px-2.5 py-0.5 rounded-full text-xs ${c.cls}`}>
            {c.label} {counts[c.key]}
          </span>
        ))}
        <span className="text-xs text-gray-400">總數 {total}（比率一律排除已取消）</span>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">進行中</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">{counts.Testing}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <p className="text-xs text-red-700">已逾期未完成</p>
          <p className="text-2xl font-semibold text-red-700 mt-1">{overdue}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">已到期完成率</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">
            {dc.rate === null ? '—' : `${dc.rate.toFixed(1)}%`}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">分母僅含已過完成日者（{dc.due} 筆）</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">延遲中</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">{counts.Delayed}</p>
        </div>
      </div>
    </div>
  )
}

export default KpiSection
