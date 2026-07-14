// src/components/schedule/FlagPopover.tsx
// 旗標編輯視窗：比照 ScheduleFormModal 的固定置中彈窗（背景遮罩 + max-w-2xl）
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  flagged:   boolean
  note:      string
  color:     'orange' | 'blue'
  anchorEl:  HTMLButtonElement | null   // 關閉後將焦點還給觸發按鈕
  onSave:    (note: string) => Promise<void>
  onRemove:  () => Promise<void>
  onClose:   () => void
}

export function FlagPopover({ flagged, note, color, anchorEl, onSave, onRemove, onClose }: Props) {
  const [inputNote, setInputNote] = useState(note)
  const [saving, setSaving] = useState(false)

  // mounted ref guard to prevent setState on unmounted component
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // sync inputNote when note prop changes (e.g. after successful save)
  useEffect(() => { setInputNote(note) }, [note])

  // restore focus to anchor element when the dialog unmounts
  useEffect(() => {
    return () => {
      anchorEl?.focus()
    }
  }, [anchorEl])

  const title       = color === 'orange' ? 'Admin 旗標' : '旗標'
  const borderColor = color === 'orange' ? 'border-orange-300' : 'border-blue-300'
  const titleColor  = color === 'orange' ? 'text-orange-600' : 'text-blue-600'
  const btnColor    = color === 'orange'
    ? 'bg-orange-500 hover:bg-orange-600 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white'

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(inputNote) }
    finally { if (mountedRef.current) setSaving(false) }
  }

  const handleRemove = async () => {
    setSaving(true)
    try { await onRemove() }
    finally { if (mountedRef.current) setSaving(false) }
  }

  // Portal to document.body：與 ScheduleFormModal 相同的遮罩置中彈窗
  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div
        role="dialog"
        aria-label={`${title}設定`}
        tabIndex={-1}
        className={`bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border-t-4 ${borderColor}`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className={`text-lg font-bold ${titleColor}`}>
            {title}{flagged ? '（已標記）' : ''}
          </h2>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            ✕
          </button>
        </div>
        <div className="px-6 pb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">附註（選填）</label>
          <textarea
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            rows={6}
            maxLength={5000}
            placeholder="輸入旗標附註…"
            value={inputNote}
            onChange={e => setInputNote(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex gap-2 justify-end px-6 pb-5">
          {flagged ? (
            <>
              <button type="button" disabled={saving} onClick={handleSave}
                className={`text-sm px-4 py-2 rounded-lg ${btnColor} disabled:opacity-50`}>
                更新
              </button>
              <button type="button" disabled={saving} onClick={handleRemove}
                className="text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
                移除標記
              </button>
            </>
          ) : (
            <button type="button" disabled={saving} onClick={handleSave}
              className={`text-sm px-4 py-2 rounded-lg ${btnColor} disabled:opacity-50`}>
              標記
            </button>
          )}
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50">
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
