import React, { useMemo } from 'react'
import { dueCompletionRate, isOverdue, fmtYmd } from '../../lib/analytics'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

const UnitComparison: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())

  const rows = useMemo(() => {
    const byUnit = new Map<string, Schedule[]>()
    schedules.filter(s => !s.isCancelled).forEach(s => {
      const key = s.testUnit || '未分配'
      byUnit.set(key, [...(byUnit.get(key) ?? []), s])
    })
    return Array.from(byUnit.entries())
      .map(([unit, list]) => ({
        unit,
        total: list.length,
        dc: dueCompletionRate(list, today),
        delayed: list.filter(s => computeStatus(s) === 'Delayed').length,
        overdue: list.filter(s => isOverdue(s, today)).length,
      }))
      .sort((a, b) => b.total - a.total)
  }, [schedules, today])

  if (rows.length === 0) return <p className="text-gray-400 text-sm">尚無資料</p>

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs">
            <th className="text-left py-1.5 font-medium">單位</th>
            <th className="text-right py-1.5 font-medium">排程數</th>
            <th className="text-right py-1.5 font-medium">已到期完成率</th>
            <th className="text-right py-1.5 font-medium">延遲中</th>
            <th className="text-right py-1.5 font-medium">逾期未完成</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.unit} className="border-t border-gray-100">
              <td className="py-2 text-gray-800">{r.unit}</td>
              <td className="py-2 text-right text-gray-600">{r.total}</td>
              <td className="py-2 text-right text-gray-600">
                {r.dc.rate === null ? '—' : `${r.dc.rate.toFixed(1)}%`}
              </td>
              <td className="py-2 text-right text-gray-600">{r.delayed}</td>
              <td className={`py-2 text-right font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {r.overdue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 mt-2">指標定義與整體概覽一致，均排除已取消</p>
    </div>
  )
}

export default UnitComparison
