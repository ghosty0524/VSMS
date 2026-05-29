// src/components/schedule/FlagPopover.tsx
import { useState, useRef, useEffect } from 'react'

interface Props {
  flagged:  boolean
  note:     string
  color:    'orange' | 'blue'
  onSave:   (note: string) => Promise<void>
  onRemove: () => Promise<void>
  onClose:  () => void
}

export function FlagPopover({ flagged, note, color, onSave, onRemove, onClose }: Props) {
  const [inputNote, setInputNote] = useState(note)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const borderColor = color === 'orange' ? 'border-orange-300' : 'border-blue-300'
  const btnColor    = color === 'orange'
    ? 'bg-orange-500 hover:bg-orange-600 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white'

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(inputNote) }
    finally { setSaving(false) }
  }

  const handleRemove = async () => {
    setSaving(true)
    try { await onRemove() }
    finally { setSaving(false) }
  }

  return (
    <div ref={ref}
      className={`absolute z-50 bg-white rounded-lg shadow-xl border ${borderColor} p-3 w-56`}
      style={{ top: '100%', right: 0, marginTop: 4 }}
    >
      <textarea
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={3}
        maxLength={500}
        placeholder="附註（選填）"
        value={inputNote}
        onChange={e => setInputNote(e.target.value)}
        disabled={saving}
      />
      <div className="flex gap-1.5 mt-2 justify-end">
        {flagged ? (
          <>
            <button type="button" disabled={saving} onClick={handleSave}
              className={`text-xs px-2.5 py-1 rounded ${btnColor} disabled:opacity-50`}>
              更新
            </button>
            <button type="button" disabled={saving} onClick={handleRemove}
              className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
              移除標記
            </button>
          </>
        ) : (
          <button type="button" disabled={saving} onClick={handleSave}
            className={`text-xs px-2.5 py-1 rounded ${btnColor} disabled:opacity-50`}>
            標記
          </button>
        )}
        <button type="button" disabled={saving} onClick={onClose}
          className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
          取消
        </button>
      </div>
    </div>
  )
}
