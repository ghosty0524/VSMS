import React from 'react'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props {
  schedules: Schedule[]
}

const KpiCards: React.FC<Props> = ({ schedules }) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(today.getDate() + 7)

  const total = schedules.length
  const completed = schedules.filter(s => computeStatus(s) === 'Completed').length
  const delayed = schedules.filter(s => computeStatus(s) === 'Delayed').length
  const expiringSoon = schedules.filter(s => {
    if (computeStatus(s) === 'Completed') return false
    const [y, m, d] = s.endDate.split('/').map(Number)
    const end = new Date(y, m - 1, d)
    return end >= today && end <= in7Days
  }).length

  const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0'
  const delayRate = total > 0 ? ((delayed / total) * 100).toFixed(1) : '0.0'

  const cards = [
    {
      label: '排程總數',
      value: total,
      color: 'bg-blue-50 border-blue-300',
      textColor: 'text-blue-700',
      icon: '📋',
    },
    {
      label: '完成率',
      value: `${completionRate}%`,
      color: 'bg-green-50 border-green-300',
      textColor: 'text-green-700',
      icon: '✅',
    },
    {
      label: '延遲率',
      value: `${delayRate}%`,
      color: 'bg-red-50 border-red-300',
      textColor: 'text-red-700',
      icon: '⚠️',
    },
    {
      label: '即將到期（7天內）',
      value: expiringSoon,
      color: 'bg-yellow-50 border-yellow-300',
      textColor: 'text-yellow-700',
      icon: '⏰',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(card => (
        <div
          key={card.label}
          className={`rounded-xl border-2 p-5 flex flex-col items-center shadow-sm ${card.color}`}
        >
          <span className="text-3xl mb-2">{card.icon}</span>
          <span className={`text-3xl font-bold ${card.textColor}`}>{card.value}</span>
          <span className="text-sm text-gray-500 mt-1 text-center">{card.label}</span>
        </div>
      ))}
    </div>
  )
}

export default KpiCards