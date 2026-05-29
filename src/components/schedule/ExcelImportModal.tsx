import { useState, useRef } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { parseImportFile } from '../../lib/excel'
import type { ImportResult } from '../../lib/excel'
import type { Schedule } from '../../types'

interface FieldDiff {
  field: 'testReport' | 'isCompleted' | 'isDelayed' | 'delayReason'
  label: string
  oldVal: string
  newVal: string
}
interface RecordDiff {
  projectName: string
  taskDescription: string
  diffs: FieldDiff[]
}

function computeDiffs(
  incoming: Array<{ projectName: string; taskDescription: string; testEngineer: string; startDate: string; endDate: string; testReport: string; isCompleted: boolean; isDelayed: boolean; delayReason: string }>,
  existing: Schedule[]
): RecordDiff[] {
  const boolStr = (v: boolean) => (v ? '是' : '否')
  const result: RecordDiff[] = []
  for (const row of incoming) {
    const match = existing.find(s =>
      s.projectName === row.projectName &&
      s.taskDescription === row.taskDescription &&
      s.testEngineer === row.testEngineer &&
      s.startDate === row.startDate &&
      s.endDate === row.endDate
    )
    if (!match) continue
    const diffs: FieldDiff[] = []
    if (row.testReport !== match.testReport)
      diffs.push({ field: 'testReport', label: '測試報告', oldVal: match.testReport || '（空白）', newVal: row.testReport || '（空白）' })
    if (row.isCompleted !== match.isCompleted)
      diffs.push({ field: 'isCompleted', label: 'Completed', oldVal: boolStr(match.isCompleted), newVal: boolStr(row.isCompleted) })
    if (row.isDelayed !== match.isDelayed)
      diffs.push({ field: 'isDelayed', label: 'Delayed', oldVal: boolStr(match.isDelayed), newVal: boolStr(row.isDelayed) })
    if (row.delayReason !== match.delayReason)
      diffs.push({ field: 'delayReason', label: '延遲原因', oldVal: match.delayReason || '（空白）', newVal: row.delayReason || '（空白）' })
    if (diffs.length > 0)
      result.push({ projectName: match.projectName, taskDescription: row.taskDescription, diffs })
  }
  return result
}

interface DiffConfirmModalProps {
  isOpen: boolean
  diffs: RecordDiff[]
  onConfirm: () => void
  onCancel: () => void
}

function DiffConfirmModal({ isOpen, diffs, onConfirm, onCancel }: DiffConfirmModalProps) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-amber-700">⚠ 覆蓋差異確認</h2>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            以下 <strong>{diffs.length}</strong> 筆資料有差異，確認後將以 Excel 內容覆蓋現有值。
          </p>
          <div className="space-y-4">
            {diffs.map((rec, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                  📋 {rec.projectName}
                  <span className="font-normal text-blue-600 ml-2 text-xs">（{rec.taskDescription}）</span>
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
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            確認覆蓋
          </button>
        </div>
      </div>
    </div>
  )
}

type ImportMode = 'replace' | 'append'

interface Props { isOpen: boolean; onClose: () => void }

export function ExcelImportModal({ isOpen, onClose }: Props) {
  const { add, replaceAll, schedules } = useScheduleStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [mode, setMode] = useState<ImportMode>('replace')
  const [diffRecords, setDiffRecords] = useState<RecordDiff[]>([])
  const [showDiff, setShowDiff] = useState(false)

  const reset = () => { setResult(null); setParseError(''); setMode('replace'); setDiffRecords([]); setShowDiff(false); if (fileRef.current) fileRef.current.value = '' }
  const handleClose = () => { reset(); onClose() }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setParsing(true); setParseError(''); setResult(null)
    try { setResult(await parseImportFile(file)) }
    catch { setParseError('檔案解析失敗，請確認為有效的 .xlsx 格式。') }
    finally { setParsing(false) }
  }

  const handleConfirm = async () => {
    if (!result || result.valid.length === 0) return
    if (mode === 'replace') {
      const diffs = computeDiffs(result.valid, schedules)
      if (diffs.length > 0) {
        setDiffRecords(diffs)
        setShowDiff(true)
        return
      }
      await replaceAll(result.valid)
    } else {
      for (const row of result.valid) await add(row)
    }
    handleClose()
  }

  const handleDiffConfirm = async () => {
    if (!result) return
    await replaceAll(result.valid)
    setShowDiff(false)
    handleClose()
  }

  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">從 Excel 匯入排程</h2>
            <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex gap-6 text-sm">
              {(['replace', 'append'] as ImportMode[]).map(m => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="importMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="w-4 h-4 text-blue-600" />
                  <span>{m === 'replace' ? '覆蓋現有資料' : '附加至現有資料'}</span>
                </label>
              ))}
            </div>
            {mode === 'replace' && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                ⚠ 覆蓋模式將清除所有現有排程，僅保留本次匯入的資料。
              </p>
            )}
            <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {parsing && <p className="text-sm text-gray-500">解析中…</p>}
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            {result && (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-green-700 font-medium">✓ 有效資料：{result.valid.length} 筆</span>
                  {result.errors.length > 0 && <span className="text-red-600 font-medium">✗ 錯誤資料：{result.errors.length} 筆</span>}
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
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
            <button type="button" onClick={handleConfirm} disabled={!result || result.valid.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              確認匯入 {result && result.valid.length > 0 ? `(${result.valid.length} 筆)` : ''}
            </button>
          </div>
        </div>
      </div>
      <DiffConfirmModal
        isOpen={showDiff}
        diffs={diffRecords}
        onConfirm={handleDiffConfirm}
        onCancel={() => setShowDiff(false)}
      />
    </>
  )
}
