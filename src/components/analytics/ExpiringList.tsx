import React, { useMemo } from 'react'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props {
  schedules: Schedule[]
  showTitle?: boolean
}

const ExpiringList: React.FC<Props> = ({ schedules, showTitle = true }) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(today.getDate() + 7)

  const expiring = useMemo(() =>
    schedules
      .filter(s => {
        if (computeStatus(s) === 'Completed') return false
        const [y, m, d] = s.endDate.split('/').map(Number)
        const end = new Date(y, m - 1, d)
        return end >= today && end <= in7Days
      })
      .sort((a, b) => {
        const [ay, am, ad] = a.endDate.split('/').map(Number)
        const [by, bm, bd] = b.endDate.split('/').map(Number)
        return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime()
      }),
    [schedules]
  )

  return (
    <div>
      {showTitle && (
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          ⏰ 即將到期清單（7天內）
          <span className="ml-2 text-sm font-normal text-gray-400">共 {expiring.length} 筆</span>
        </h3>
      )}
      {!showTitle && (
        <p className="text-xs text-gray-400 mb-3">共 {expiring.length} 筆</p>
      )}
      {expiring.length === 0 ? (
        <p className="text-gray-400 text-sm">目前無即將到期的排程</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-4 py-2 text-left">專案名稱</th>
                <th className="px-4 py-2 text-left">測試人員</th>
                <th className="px-4 py-2 text-left">測試單位</th>
                <th className="px-4 py-2 text-left">到期日</th>
                <th className="px-4 py-2 text-left">剩餘天數</th>
                <th className="px-4 py-2 text-left">狀態</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map(s => {
                const [y, m, d] = s.endDate.split('/').map(Number)
                const end = new Date(y, m - 1, d)
                const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000)
                const status = computeStatus(s)
                return (
                  <tr key={s.id} className="border-t hover:bg-yellow-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-800">{s.projectName}</td>
                    <td className="px-4 py-2 text-gray-600">{s.testEngineer || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{s.testUnit || '-'}</td>
                    <td className="px-4 py-2 text-gray-600">{s.endDate}</td>
                    <td className="px-4 py-2">
                      <span className={`font-semibold ${diff <= 2 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {diff} 天
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ExpiringList