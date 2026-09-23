import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { NotifyConfig, NotifyRule } from '../../types'
import { NotifyLogTable } from './NotifyLogTable'
import { FallbackRecipients } from './FallbackRecipients'

export function NotifyManager() {
  const [config, setConfig] = useState<NotifyConfig | null>(null)
  const [rules, setRules] = useState<NotifyRule[]>([])
  const [testUnits, setTestUnits] = useState<{ value: string; label: string }[]>([])
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // 遞增後傳給 NotifyLogTable 觸發重載。「立即檢查並補寄」會產生新的通知記錄，
  // 但那張表在別的元件裡，不主動通知它就會停在舊內容。
  const [logRefresh, setLogRefresh] = useState(0)

  const reload = async () => {
    const [c, r] = await Promise.all([api.notifyConfig(), api.notifyRules()])
    setConfig(c); setRules(r.rules); setTestUnits(r.testUnits)
  }
  useEffect(() => { reload().catch(e => setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })) }, [])

  const saveConfig = async (patch: Partial<NotifyConfig>) => {
    if (!config) return
    setConfig({ ...config, ...patch })
    try {
      await api.updateNotifyConfig(patch)
      setMsg({ kind: 'ok', text: '已儲存' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
      await reload()
    }
  }

  const saveRule = async (rule: NotifyRule, patch: Partial<NotifyRule>): Promise<boolean> => {
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, ...patch } : r))
    try {
      await api.updateNotifyRule(rule.id, patch)
      setMsg({ kind: 'ok', text: '已儲存' })
      return true
    } catch (e) {
      const text = e instanceof ApiError && e.fieldErrors
        ? Object.values(e.fieldErrors).join('；')
        : e instanceof ApiError ? e.message : String(e)
      setMsg({ kind: 'err', text })
      await reload()
      return false
    }
  }

  const sendTest = async () => {
    if (!testTo.trim()) { setMsg({ kind: 'err', text: '請先填收件地址' }); return }
    setBusy(true)
    try {
      await api.notifyTest(testTo.trim())
      setMsg({ kind: 'ok', text: `測試信已寄至 ${testTo.trim()}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const runNow = async () => {
    setBusy(true)
    try {
      const r = await api.notifyRun()
      // 已經有另一次執行在跑（例如另一個分頁、或前一次還沒逾時就被再按了
      // 一次）——這次沒有真的檢查任何東西，不能跟「檢查 0 筆」顯示成同一句，
      // 否則管理者會誤以為今天真的沒有該寄的信。
      if (r.alreadyRunning) {
        setMsg({ kind: 'ok', text: '已有另一次檢查正在執行中，本次未重複執行。請稍候再查看下方通知記錄。' })
        return
      }
      const hasProblem = r.missedWindow > 0 || r.failed > 0 || r.errors.length > 0
      let text = `檢查 ${r.checked} 筆，寄出 ${r.sent}，重複略過 ${r.deduped}，失敗 ${r.failed}，略過 ${r.skipped}` +
        (r.excluded > 0 ? `，依排除規則不寄 ${r.excluded}` : '') +
        (r.missedWindow > 0
          ? `，超出補寄視窗未寄 ${r.missedWindow} 筆`
          : `，超出補寄視窗 0 筆`)
      if (r.errors.length > 0) {
        text += `\n錯誤明細：${r.errors.map(e => `${e.scheduleId}：${e.message}`).join('；')}`
      }
      setMsg({ kind: hasProblem ? 'err' : 'ok', text })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setBusy(false)
      // 成功、失敗、alreadyRunning 都要重載：失敗那批也會寫進通知記錄，
      // 只在成功時重載會讓使用者看不到剛剛失敗的那幾筆。
      setLogRefresh(n => n + 1)
    }
  }

  const addRule = async (unit: string) => {
    try { await api.createNotifyRule(unit); await reload() }
    catch (e) { setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) }) }
  }

  const deleteRule = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.deleteNotifyRule(id)
      await reload()
      setMsg({ kind: 'ok', text: '已刪除' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  if (!config) return <p className="text-sm text-gray-400">載入中…</p>

  const defaultRule = rules.find(r => r.testUnit === null)
  const unitRules = rules.filter(r => r.testUnit !== null)
  const unusedUnits = testUnits.filter(u => !unitRules.some(r => r.testUnit === u.value))

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p className={`flex items-start gap-2 text-sm rounded px-3 py-2 whitespace-pre-line ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.kind === 'ok'
            ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </p>
      )}

      {!config.smtpConfigured && (
        <p className="text-sm rounded px-3 py-2 bg-amber-50 text-amber-800">
          尚未連接通知平台。請在伺服器的 .env 設定 NOTIFY_URL 與 VAUTH_SERVICE_KEY 後重啟服務；SMTP 由平台統一設定。
        </p>
      )}

      {/* ── 全域設定 ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">預告通知設定</h3>
        <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm">
          <input type="checkbox" checked={config.enabled}
            onChange={e => saveConfig({ enabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          <span>啟用預告通知（總開關）</span>
        </label>

        <div className="grid grid-cols-2 gap-4 max-w-md">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1" title="往前數幾個工作天寄出；休息日不計入">
              提前工作天數
            </span>
            <input type="number" min={1} value={config.leadDays}
              onChange={e => setConfig({ ...config, leadDays: Number(e.target.value) })}
              onBlur={e => saveConfig({ leadDays: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">補寄視窗（天，最少 1）</span>
            <input type="number" min={1} value={config.catchUpDays}
              onChange={e => setConfig({ ...config, catchUpDays: Number(e.target.value) })}
              onBlur={e => saveConfig({ catchUpDays: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
            <span className="block text-xs text-gray-400 mt-1">
              失敗的通知會在此視窗內重試，最多 3 次；設為 0 會讓重試機制失效
            </span>
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-xs text-gray-600 mb-1">公司信箱網域（不含 @）</span>
            <input type="text" value={config.mailDomain}
              onChange={e => setConfig({ ...config, mailDomain: e.target.value })}
              onBlur={e => saveConfig({ mailDomain: e.target.value })}
              placeholder="example.com.tw"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-xs text-gray-600 mb-1">系統連結（信件中的回連網址）</span>
            <input type="text" value={config.systemUrl}
              onChange={e => setConfig({ ...config, systemUrl: e.target.value })}
              onBlur={e => saveConfig({ systemUrl: e.target.value })}
              placeholder="https://vsms.example.com:3001"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
        </div>

        <div className="flex gap-2 items-end mt-4">
          <label className="text-sm flex-1 max-w-xs">
            <span className="block text-xs text-gray-600 mb-1">測試收件地址</span>
            <input type="text" value={testTo} onChange={e => setTestTo(e.target.value)}
              placeholder="you@example.com.tw"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <button type="button" onClick={sendTest} disabled={busy}
            className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-40">
            寄測試信
          </button>
          <button type="button" onClick={runNow} disabled={busy}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
            立即檢查並補寄
          </button>
        </div>
      </section>

      {/* ── 代收群組 ── */}
      <section className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">代收群組</h3>
        <p className="text-xs text-gray-500 mb-3">
          需求人員無法對應為有效信箱時，整封通知改寄給這裡的人；此時各單位的固定副本不會發送。
        </p>
        <FallbackRecipients recipients={config.fallbackRecipients} onChanged={reload} />
      </section>

      {/* ── 規則 ── */}
      <section className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">信件內容規則</h3>
        <p className="text-xs text-gray-500 mb-3">
          可用變數：{config.templateVars.map(v => `{{${v}}}`).join('、')}
        </p>

        {defaultRule && <RuleEditor rule={defaultRule} isDefault onSave={saveRule} />}

        {unitRules.map(rule => (
          <RuleEditor key={rule.id} rule={rule} isDefault={false} onSave={saveRule}
            onDelete={() => deleteRule(rule.id)} busy={busy} />
        ))}

        {unusedUnits.length > 0 && (
          <div className="flex gap-2 items-center mt-3">
            <span className="text-xs text-gray-600">為測試單位新增規則：</span>
            <select defaultValue="" onChange={e => { if (e.target.value) addRule(e.target.value) }}
              className="text-sm border border-gray-300 rounded px-2 py-1.5">
              <option value="">選擇單位…</option>
              {unusedUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        )}
      </section>

      {/* ── 通知記錄 ── */}
      <section className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">通知記錄</h3>
        <NotifyLogTable refreshToken={logRefresh} />
      </section>
    </div>
  )
}

type DraftKey = 'subjectTemplate' | 'introTemplate' | 'outroTemplate' | 'ccRecipients'

function RuleEditor({ rule, isDefault, onSave, onDelete, busy }: {
  rule: NotifyRule
  isDefault: boolean
  onSave: (rule: NotifyRule, patch: Partial<NotifyRule>) => Promise<boolean>
  onDelete?: () => void
  busy?: boolean
}) {
  // 文字欄位先進 draft，onBlur 才送出。用 onChange 直接送會讓每按一個鍵就打一次
  // PUT，而 PUT 會跑範本驗證並寫 audit —— 打一句話等於幾十次寫入。
  const [draft, setDraft] = useState<Partial<Record<DraftKey, string>>>({})
  const valueOf = (key: DraftKey) => draft[key] ?? rule[key] ?? ''
  const commit = async (key: DraftKey) => {
    const next = draft[key]
    if (next === undefined || next === (rule[key] ?? '')) return
    // 失敗時 draft 必須留著，讓管理者能照著剛才打的字修正後再送一次；
    // 只有存檔成功才清掉，避免文字憑空消失。
    const ok = await onSave(rule, { [key]: next })
    if (ok) {
      setDraft(d => { const { [key]: _drop, ...rest } = d; return rest })
    }
  }

  const field = (key: 'subjectTemplate' | 'introTemplate' | 'outroTemplate', label: string) => {
    const inherits = rule[key] === null
    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600">{label}</span>
          {!isDefault && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={inherits}
                onChange={e => onSave(rule, { [key]: e.target.checked ? null : '' })}
                className="w-3.5 h-3.5 rounded border-gray-300" />
              沿用預設
            </label>
          )}
        </div>
        <textarea rows={key === 'subjectTemplate' ? 1 : 2}
          value={valueOf(key)} disabled={inherits}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
          onBlur={() => commit(key)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">
          {isDefault ? '預設規則（所有單位的基底）' : rule.testUnit}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={rule.enabled}
              onChange={e => onSave(rule, { enabled: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300" />
            啟用
          </label>
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy}
              className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40">
              × 刪除
            </button>
          )}
        </div>
      </div>
      {field('subjectTemplate', '主旨')}
      {field('introTemplate', '開頭文字（資料表格之前）')}
      <p className="text-xs text-gray-400 mb-3">資料表格由系統固定產生，無法修改</p>
      {field('outroTemplate', '結尾文字（資料表格之後）')}
      <label className="text-sm block">
        <span className="block text-xs font-medium text-gray-600 mb-1">
          固定副本收件人（逗號分隔；會與預設規則的副本合併）
        </span>
        <input type="text" value={valueOf('ccRecipients')}
          onChange={e => setDraft(d => ({ ...d, ccRecipients: e.target.value }))}
          onBlur={() => commit('ccRecipients')}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
      </label>
    </div>
  )
}
