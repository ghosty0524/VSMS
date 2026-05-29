import React, { useState, useRef } from 'react'
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react'
import { useOptionsStore } from '../../store/optionsStore'
import type { RestDaysConfig } from '../../types'

function toYmd(iso: string): string {
  // 將 server 回傳的 YYYY-MM-DD 轉成 RestDaysManager 用的 YYYY/MM/DD
  return iso.replace(/-/g, '/')
}

type ImportResult = {
  ok: boolean
  year?: number
  nonWeekendHolidayCount?: number
  added?: number
  skipped?: number
  message?: string
}

export default function CalendarImport() {
  const { options, setRestDays } = useOptionsStore()
  const [file, setFile]         = useState<File | null>(null)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)

  const handleChoose = () => {
    setResult(null)
    inputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setResult(null)
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      // 1. 上傳至 server 解析
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch('/api/calendar/import-government', {
        method: 'POST',
        body: fd,
      })
      const json = await resp.json()

      if (!json.ok) {
        setResult({ ok: false, message: json.message ?? '匯入失敗' })
        return
      }

      // 2. 取得完整清單（sample 只有 12 筆，需再打一次 GET 取全部）
      const year: number = json.year
      const getResp = await fetch(`/api/calendar/non-weekend-holidays?year=${year}`)
      const getData = await getResp.json()
      const holidays: string[] = getData.nonWeekendHolidays ?? []

      // 3. 轉成 YYYY/MM/DD 並 merge 進 optionsStore
      const config: RestDaysConfig = options.restDays ?? { weekends: true, specificDates: [] }
      const existing = new Set(config.specificDates)
      const toAdd    = holidays.map(toYmd).filter(d => !existing.has(d))
      const skipped  = holidays.length - toAdd.length

      const merged = [...config.specificDates, ...toAdd].sort()
      await setRestDays({ ...config, specificDates: merged })

      setResult({
        ok:                     true,
        year,
        nonWeekendHolidayCount: holidays.length,
        added:                  toAdd.length,
        skipped,
      })
    } catch (e: unknown) {
      setResult({ ok: false, message: e instanceof Error ? e.message : '上傳失敗' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">

      {/* 標題 */}
      <div>
        <div className="text-sm font-semibold text-slate-800">行事曆 / 休息日匯入</div>
        <div className="mt-0.5 text-xs text-slate-500">
          支援直接上傳政府「辦公日曆表」Excel 原檔，自動匯入所有「非週末」放假日至下方特定休息日清單。
        </div>
      </div>

      {/* 隱藏的 file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 操作列 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleChoose}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300
                     bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FileSpreadsheet size={15} className="text-slate-500" />
          選擇檔案
        </button>

        <span className="flex-1 truncate text-sm">
          {file
            ? <span className="text-slate-700">{file.name}</span>
            : <span className="text-slate-400">尚未選擇檔案</span>
          }
        </span>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800
                     px-4 py-2 text-sm font-medium text-white hover:bg-slate-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <UploadCloud size={15} />
          {loading ? '匯入中…' : '匯入'}
        </button>
      </div>

      {/* 結果回饋 */}
      {result && (
        <div className={`rounded-lg border p-3 text-sm space-y-1
          ${result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
        >
          {result.ok ? (
            <>
              <div className="flex items-center gap-1.5 font-medium text-green-800">
                <CheckCircle2 size={15} />
                匯入成功（{result.year} 年）
              </div>
              <div className="text-green-700 text-xs">
                共偵測 <strong>{result.nonWeekendHolidayCount}</strong> 筆非週末放假日，
                新增 <strong>{result.added}</strong> 筆，
                已存在略過 <strong>{result.skipped}</strong> 筆。
              </div>
              <div className="text-green-600 text-xs">
                ✓ 已同步至下方「特定休息日」清單，可逐筆刪除。
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 font-medium text-red-700">
                <XCircle size={15} />
                匯入失敗
              </div>
              <div className="text-red-600 text-xs">{result.message ?? '未知錯誤'}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}