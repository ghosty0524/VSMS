import { useState, useRef, useMemo } from 'react'
import { AlertTriangle, FileText, X, Trash2, Plus, RefreshCw } from 'lucide-react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useAuthStore } from '../../store/authStore'
import { useEscapeKey } from '../shared/useEscapeKey'
import { parseImportFile } from '../../lib/excel'
import type { ImportResult } from '../../lib/excel'
import { computeDiffs, computeReplaceImpact } from '../../lib/importImpact'
import type { RecordDiff, ReplaceImpact } from '../../lib/importImpact'
import { toast } from '../../store/toastStore'

type ImportMode = 'replace' | 'append'

// ─────────────────────────────────────────────────────────────
// 覆蓋確認
//
// 舊版只在「找得到對應排程且欄位有差異」時才跳這一步。匯入檔若跟現有資料
// 完全對不上（例如日期整批改過），差異清單是空的，程式就直接 replaceAll，
// 把整批排程清掉換成新檔，中間沒有任何一步告訴使用者將刪除多少筆。
//
// 現在覆蓋一律先到這裡，而且先講後果的數字，再講欄位明細。
// ─────────────────────────────────────────────────────────────
interface ReplaceConfirmModalProps {
  isOpen: boolean
  impact: ReplaceImpact
  diffs: RecordDiff[]
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ReplaceConfirmModal({ isOpen, impact, diffs, busy, onConfirm, onCancel }: ReplaceConfirmModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [showDiffs, setShowDiffs] = useState(false)
  useEscapeKey(isOpen, onCancel)

  if (!isOpen) return null

  const destructive = impact.deleted > 0
  const canConfirm = !busy && (!destructive || acknowledged)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div role="dialog" aria-label="確認覆蓋匯入"
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">

        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-700">
            <AlertTriangle size={18} />
            確認覆蓋匯入
          </h2>
          <button type="button" aria-label="關閉" onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 先講後果，再講細節 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className={`rounded-lg p-3 ${destructive ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <p className={`flex items-center gap-1 text-xs ${destructive ? 'text-red-700' : 'text-gray-500'}`}>
                <Trash2 size={12} /> 刪除
              </p>
              <p className={`tnum text-2xl font-semibold mt-1 ${destructive ? 'text-red-700' : 'text-gray-800'}`}>
                {impact.deleted}
              </p>
            </div>
            <div className="rounded-lg p-3 bg-gray-50">
              <p className="flex items-center gap-1 text-xs text-gray-500"><Plus size={12} /> 新增</p>
              <p className="tnum text-2xl font-semibold text-gray-800 mt-1">{impact.added}</p>
            </div>
            <div className="rounded-lg p-3 bg-gray-50">
              <p className="flex items-center gap-1 text-xs text-gray-500"><RefreshCw size={12} /> 更新</p>
              <p className="tnum text-2xl font-semibold text-gray-800 mt-1">{impact.updated}</p>
            </div>
            <div className="rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-500">維持不變</p>
              <p className="tnum text-2xl font-semibold text-gray-800 mt-1">{impact.unchanged}</p>
            </div>
          </div>

          {impact.outOfScope > 0 && (
            <p className="text-xs text-gray-500">
              另有 {impact.outOfScope} 筆不在您的管轄單位內，這次匯入完全不會動到。
            </p>
          )}

          {destructive && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                以下排程會從系統中消失
              </div>
              <ul className="px-3 py-2 space-y-0.5 text-xs text-gray-700">
                {impact.deletedSamples.map((name, i) => (
                  <li key={i} className="truncate">{name}</li>
                ))}
                {impact.deleted > impact.deletedSamples.length && (
                  <li className="text-gray-500">…等共 {impact.deleted} 筆</li>
                )}
              </ul>
            </div>
          )}

          {diffs.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowDiffs(v => !v)}
                className="text-sm text-blue-700 hover:underline">
                {showDiffs ? '收合' : '展開'}欄位變動明細（{diffs.length} 筆）
              </button>
              {showDiffs && (
                <div className="mt-2 space-y-3">
                  {diffs.map((rec, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                        <FileText size={14} className="flex-shrink-0" />
                        {rec.projectName}
                        <span className="font-normal text-blue-600 ml-0.5 text-xs">（{rec.taskDescription}）</span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-1/4">欄位</th>
                            <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-[37.5%]">現有值</th>
                            <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-[37.5%]">Excel 值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rec.diffs.map((d, j) => (
                            <tr key={j} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 text-gray-600">{d.label}</td>
                              <td className="px-3 py-1.5 text-red-600 line-through">{d.oldVal}</td>
                              <td className="px-3 py-1.5 text-green-700 font-medium">{d.newVal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {destructive && (
            <label className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-red-600 flex-shrink-0" />
              <span>我了解這會永久刪除 {impact.deleted} 筆現有排程，且無法復原。</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            取消
          </button>
          <button type="button" onClick={onConfirm} disabled={!canConfirm}
            title={destructive && !acknowledged ? '請先勾選上方的確認' : undefined}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? '匯入中…' : '確認覆蓋'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props { isOpen: boolean; onClose: () => void }

export function ExcelImportModal({ isOpen, onClose }: Props) {
  const { add, replaceAll, schedules } = useScheduleStore()
  const allowedUnits = useAuthStore(s => s.allowedUnits)
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  // 刻意不給預設值。舊版預設「覆蓋」，按熟了就會不看畫面直接確認；
  // 但把預設改成「附加」同樣危險 —— 原本習慣覆蓋的人會在不知情下產生重複資料。
  // 兩害相權，改成必須明確選一個。
  const [mode, setMode] = useState<ImportMode | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setResult(null); setParseError(''); setMode(null)
    setShowConfirm(false); setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  const handleClose = () => { reset(); onClose() }
  // 覆蓋確認開著時 Esc 應該只收掉那一層，不要連整個匯入視窗一起關掉
  useEscapeKey(isOpen && !showConfirm, handleClose)

  const impact = useMemo(
    () => computeReplaceImpact(result?.valid ?? [], schedules, allowedUnits),
    [result, schedules, allowedUnits],
  )
  const diffs = useMemo(
    () => computeDiffs(result?.valid ?? [], schedules),
    [result, schedules],
  )

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setParsing(true); setParseError(''); setResult(null)
    try { setResult(await parseImportFile(file)) }
    catch { setParseError('檔案解析失敗，請確認為有效的 .xlsx 格式。') }
    finally { setParsing(false) }
  }

  const runAppend = async () => {
    if (!result) return
    setBusy(true)
    const id = toast.loading(`匯入中… 0 / ${result.valid.length}`)
    try {
      for (const row of result.valid) await add(row)
      toast.dismiss(id)
      toast.success(`已附加 ${result.valid.length} 筆排程`)
      handleClose()
    } catch (err) {
      toast.dismiss(id)
      toast.error(`匯入失敗：${String(err)}`)
      setBusy(false)
    }
  }

  const runReplace = async () => {
    if (!result) return
    setBusy(true)
    const id = toast.loading('覆蓋匯入中…')
    try {
      await replaceAll(result.valid)
      toast.dismiss(id)
      toast.success(
        `覆蓋完成：刪除 ${impact.deleted} 筆、新增 ${impact.added} 筆、更新 ${impact.updated} 筆`,
        6000,
      )
      handleClose()
    } catch (err) {
      toast.dismiss(id)
      toast.error(`覆蓋匯入失敗，資料未變更：${String(err)}`)
      setBusy(false)
      setShowConfirm(false)
    }
  }

  const handleConfirm = () => {
    if (!result || result.valid.length === 0 || mode === null) return
    // 覆蓋一律先確認，不再依「有沒有欄位差異」決定要不要問
    if (mode === 'replace') { setShowConfirm(true); return }
    void runAppend()
  }

  if (!isOpen) return null

  const confirmLabel = mode === null
    ? '請先選擇匯入方式'
    : mode === 'replace'
      ? '檢視覆蓋影響'
      : `確認附加${result && result.valid.length > 0 ? `（${result.valid.length} 筆）` : ''}`

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">從 Excel 匯入排程</h2>
            <button type="button" aria-label="關閉" onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          <div className="p-4 space-y-4">
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">匯入方式</legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer text-sm">
                  <input type="radio" name="importMode" value="append"
                    checked={mode === 'append'} onChange={() => setMode('append')}
                    className="w-4 h-4 mt-0.5 accent-blue-600" />
                  <span>
                    附加至現有資料
                    <span className="block text-xs text-gray-500">保留所有現有排程，把檔案裡的排程加進去。</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-sm">
                  <input type="radio" name="importMode" value="replace"
                    checked={mode === 'replace'} onChange={() => setMode('replace')}
                    className="w-4 h-4 mt-0.5 accent-red-600" />
                  <span>
                    覆蓋現有資料
                    <span className="block text-xs text-gray-500">
                      {allowedUnits.length > 0
                        ? `先刪除您管轄單位（${allowedUnits.join('、')}）的所有排程，再匯入檔案內容。`
                        : '先刪除系統中所有排程，再匯入檔案內容。'}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {mode === 'replace' && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>下一步會列出這次覆蓋將刪除、新增與更新的筆數，確認後才會實際執行。</span>
              </p>
            )}

            <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {parsing && <p className="text-sm text-gray-500">解析中…</p>}
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}

            {result && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-green-700 font-medium">有效資料：{result.valid.length} 筆</span>
                  {result.errors.length > 0 && (
                    <span className="text-red-600 font-medium">錯誤資料：{result.errors.length} 筆</span>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="border border-red-200 rounded p-3 bg-red-50 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-red-700 mb-1">錯誤明細：</p>
                    {result.errors.map(err => (
                      <div key={err.row} className="text-xs text-red-600">第 {err.row} 列：{err.messages.join('、')}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t">
            <button type="button" onClick={handleClose} disabled={busy}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              取消
            </button>
            <button type="button" onClick={handleConfirm}
              disabled={!result || result.valid.length === 0 || mode === null || busy}
              className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed
                ${mode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-800'}`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>

      <ReplaceConfirmModal
        isOpen={showConfirm}
        impact={impact}
        diffs={diffs}
        busy={busy}
        onConfirm={() => void runReplace()}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
