import { useState } from 'react'
import DatePicker from 'react-datepicker'
import { useOptionsStore } from '../../store/optionsStore'
import { displayYmd } from '../../lib/dateFormat'

function ymd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

export function RestDaysManager() {
  const { options, addRestDay, removeRestDay } = useOptionsStore()
  const dates = options.restDays?.specificDates ?? []
  const [newDate, setNewDate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 每次只改一筆、由伺服器回傳完整清單：別的分頁開著舊的設定頁也蓋不掉這份清單
  const run = async (op: () => Promise<void>): Promise<boolean> => {
    setError(null)
    try {
      await op()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗')
      return false
    }
  }

  const handleAdd = async () => {
    if (!newDate) return
    const v = ymd(newDate)
    if (dates.includes(v)) return
    if (await run(() => addRestDay(v))) setNewDate(null)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">休息日設定</h3>
      <p className="text-xs text-gray-500 mb-4">
        週六、週日固定休息。下方清單供 VSMS、VTMS、MCP 共用，新增或刪除立即全平台生效。
      </p>
      <p className="text-xs font-medium text-gray-600 mb-2">特定休息日（例：國定假日）</p>
      <div className="flex gap-2 mb-3">
        <DatePicker selected={newDate} onChange={(d: Date | null) => setNewDate(d)}
          dateFormat="yyyy/MM/dd" placeholderText="選擇日期"
          className="text-sm border border-gray-300 rounded px-2 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={handleAdd} disabled={!newDate}
          className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-40">
          ＋ 新增
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 mb-2">{error}</p>}
      {dates.length === 0 ? (
        <p className="text-xs text-gray-400">尚無特定休息日</p>
      ) : (
        <ul className="space-y-1">
          {dates.map(v => (
            <li key={v} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
              <span>{displayYmd(v)}</span>
              <button type="button" onClick={() => { void run(() => removeRestDay(v)) }}
                className="text-gray-400 hover:text-red-500 text-xs">× 刪除</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
