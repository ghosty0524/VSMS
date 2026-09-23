import React, { useMemo } from 'react'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

const DelayAnalysis: React.FC<Props> = ({ schedules }) => {
  const delayed = useMemo(
    () => schedules.filter(s => computeStatus(s) === 'Delayed'),
    [schedules]
  )

  const byUnit = useMemo(() => {
    const map = new Map<string, number>()
    delayed.forEach(s => {
      const key = s.testUnit || '未分配'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [delayed])

  if (delayed.length === 0) return <p className="text-gray-400 text-sm">目前沒有延遲的排程</p>

  const max = byUnit[0][1]

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {byUnit.map(([unit, count]) => (
          <div key={unit} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 shrink-0">{unit}</span>
            <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
              <div className="h-full bg-red-600 rounded-sm" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-600 w-6 text-right">{count}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1.5">延遲原因</p>
        <div className="space-y-1.5">
          {delayed.map(s => (
            <p key={s.id} className="text-sm text-gray-600 leading-snug">
              <span className="font-medium text-gray-800">{s.projectName}</span>
              <span className="text-gray-400"> · {s.testEngineer || '-'}</span>
              {s.delayReason && <span> — {s.delayReason}</span>}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DelayAnalysis
