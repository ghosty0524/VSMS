import { useMemo, useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'
import { useAuthStore } from '../../store/authStore'
import { displayYmd } from '../../lib/dateFormat'

function ymd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 一個月的格子：前面補空格讓 1 號落在正確的星期 */
function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d))
  return cells
}

function toggle(set: Set<string>, v: string): Set<string> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

export function RestDaysManager() {
  const { options, removeRestDay, batchRestDays } = useOptionsStore()
  const { role } = useAuthStore()
  // 寫入 API 只收 admin／super_admin；其他角色看得到日曆但不能點
  const canEdit = role === 'admin' || role === 'super_admin'
  const dates = options.restDays?.specificDates ?? []
  const saved = useMemo(() => new Set(dates), [dates])
  const today = ymd(new Date())

  const [year, setYear] = useState(() => new Date().getFullYear())
  // 待儲存的變更：只記「跟目前清單不同」的日期，點兩下等於取消
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set())
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = pendingAdd.size + pendingRemove.size > 0
  const upcoming = dates.filter(d => d >= today)
  const past = dates.filter(d => d < today)
  const yearCount = dates.filter(d => d.startsWith(`${year}/`)).length

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

  const clickDay = (v: string) => {
    if (saved.has(v)) setPendingRemove(s => toggle(s, v))
    else setPendingAdd(s => toggle(s, v))
  }

  const discard = () => { setPendingAdd(new Set()); setPendingRemove(new Set()); setError(null) }

  const save = async () => {
    setSaving(true)
    const ok = await run(() => batchRestDays([...pendingAdd].sort(), [...pendingRemove].sort()))
    setSaving(false)
    if (ok) discard()
  }

  const dayClass = (v: string, weekend: boolean): string => {
    const base = 'h-7 w-full rounded text-xs tabular-nums flex items-center justify-center'
    const todayRing = v === today ? ' ring-1 ring-stone-900 font-semibold' : ''
    if (weekend) return `${base} text-gray-400 bg-gray-50${todayRing}`
    if (pendingAdd.has(v)) return `${base} bg-red-500 text-white font-semibold${todayRing}`
    if (pendingRemove.has(v)) return `${base} bg-white text-red-400 line-through outline outline-1 outline-dashed outline-red-400${todayRing}`
    if (saved.has(v)) return `${base} bg-red-100 text-red-700 font-medium${todayRing}`
    return `${base} text-gray-700${canEdit ? ' hover:bg-gray-100' : ''}${todayRing}`
  }

  const renderItem = (v: string) => (
    <li key={v} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
      <span>{displayYmd(v)}</span>
      {canEdit && (
        <button type="button" onClick={() => { void run(() => removeRestDay(v)) }}
          className="text-gray-400 hover:text-red-500 text-xs">× 刪除</button>
      )}
    </li>
  )

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">休息日設定</h3>
      <p className="text-xs text-gray-500 mb-4">
        週六、週日固定休息。下方清單供 VSMS、VTMS、MCP 共用，儲存後立即全平台生效。
      </p>

      {/* ── 年度日曆：點選日期切換休息日，最後一併儲存 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="上一年" onClick={() => setYear(y => y - 1)}
            className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50">‹</button>
          <span className="px-2 text-sm font-semibold text-gray-800 tabular-nums" aria-live="polite">{year} 年</span>
          <button type="button" aria-label="下一年" onClick={() => setYear(y => y + 1)}
            className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50">›</button>
          {year !== new Date().getFullYear() && (
            <button type="button" onClick={() => setYear(new Date().getFullYear())}
              className="ml-1 px-2 py-1 text-xs rounded text-gray-500 hover:bg-gray-100">回到今年</button>
          )}
          <span className="ml-2 text-xs text-gray-500">本年度 {yearCount} 個特定休息日</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100" />休息日</span>
          {canEdit && <>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500" />將新增</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded outline outline-1 outline-dashed outline-red-400" />將移除</span>
          </>}
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-50 text-gray-400 text-[9px] leading-3 text-center">六</span>週末</span>
        </div>
      </div>
      {canEdit && <p className="text-xs text-gray-500 mb-3">點選平日即可標成休息日、再點一次取消；已是休息日的點一下會標成移除。選好後按「儲存變更」。</p>}
      {yearCount === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-3">此年度尚無任何特定休息日（可能尚未匯入政府辦公日曆）。</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
        {Array.from({ length: 12 }, (_, m) => (
          <div key={m} className="border border-gray-200 rounded p-2">
            <div className="text-xs font-semibold text-gray-700 mb-1">{m + 1} 月</div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map(w => <div key={w} className="text-[10px] text-gray-400">{w}</div>)}
              {monthCells(year, m).map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const v = ymd(d)
                const weekend = d.getDay() === 0 || d.getDay() === 6
                const clickable = canEdit && !weekend && !saving
                const state = pendingAdd.has(v) ? '，將新增' : pendingRemove.has(v) ? '，將移除' : saved.has(v) ? '，休息日' : ''
                return clickable ? (
                  <button key={v} type="button" onClick={() => clickDay(v)}
                    aria-label={`${displayYmd(v)}${state}`}
                    aria-pressed={(saved.has(v) && !pendingRemove.has(v)) || pendingAdd.has(v)}
                    className={dayClass(v, weekend)}>{d.getDate()}</button>
                ) : (
                  <div key={v} aria-label={`${displayYmd(v)}${weekend ? '，週末' : state}`} className={dayClass(v, weekend)}>{d.getDate()}</div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-white border border-gray-200 rounded shadow-sm px-3 py-2 mb-4">
          <span className="text-sm text-gray-700">
            待儲存：新增 <strong>{pendingAdd.size}</strong> 天、移除 <strong>{pendingRemove.size}</strong> 天
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={discard} disabled={saving}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">取消</button>
            <button type="button" onClick={() => { void save() }} disabled={saving}
              className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-40">
              {saving ? '儲存中…' : '儲存變更'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600 mb-2">{error}</p>}

      {/* ── 清單：未到期的直接列出，已結束的收合 ── */}
      <p className="text-xs font-medium text-gray-600 mb-2">即將到來的特定休息日</p>
      {upcoming.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">尚無即將到來的特定休息日</p>
      ) : (
        <ul className="space-y-1 mb-3">{upcoming.map(renderItem)}</ul>
      )}
      {past.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-xs text-gray-500 hover:text-gray-700">
            已結束的休息日（{past.length}）
          </summary>
          <ul className="space-y-1 mt-2">{[...past].reverse().map(renderItem)}</ul>
        </details>
      )}
    </div>
  )
}
