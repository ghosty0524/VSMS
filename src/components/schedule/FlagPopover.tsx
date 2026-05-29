// src/components/schedule/FlagPopover.tsx
import { useState, useRef, useEffect, useLayoutEffect } from 'react'

interface Props {
  flagged:   boolean
  note:      string
  color:     'orange' | 'blue'
  anchorEl:  HTMLButtonElement | null   // Fix 1: anchor for fixed positioning
  onSave:    (note: string) => Promise<void>
  onRemove:  () => Promise<void>
  onClose:   () => void
}

export function FlagPopover({ flagged, note, color, anchorEl, onSave, onRemove, onClose }: Props) {
  const [inputNote, setInputNote] = useState(note)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fix 3: mounted ref guard to prevent setState on unmounted component
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Fix 1: sync inputNote when note prop changes (e.g. after successful save)
  useEffect(() => { setInputNote(note) }, [note])

  // Fix 2: exclude anchorEl from outside-click check so toggle works correctly
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)
          && !anchorEl?.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorEl])

  // Fix 3: compute fixed position in useLayoutEffect to avoid render-time reflow
  const [pos, setPos] = useState<React.CSSProperties>({ position: 'fixed', top: 0, right: 0, zIndex: 9999 })

  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    setPos({ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, zIndex: 9999 })
  }, [anchorEl])

  // Fix 6: restore focus to anchor element when popover unmounts
  useEffect(() => {
    return () => {
      anchorEl?.focus()
    }
  }, [anchorEl])

  // Fix 4: if anchorEl is null, render nothing to avoid broken top-right placement
  if (!anchorEl) return null

  const borderColor = color === 'orange' ? 'border-orange-300' : 'border-blue-300'
  const btnColor    = color === 'orange'
    ? 'bg-orange-500 hover:bg-orange-600 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white'

  // Fix 3: guard setSaving in finally blocks
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

  return (
    // Fix 7: keyboard accessibility — Escape key, role, tabIndex
    <div ref={ref}
      style={pos}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-label="旗標設定"
      tabIndex={-1}
      className={`bg-white rounded-lg shadow-xl border ${borderColor} p-3 w-56`}
    >
      {/* Fix 7: autoFocus on textarea */}
      <textarea
        autoFocus
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
        {/* Fix 6: removed disabled={saving} from Cancel so users can always close */}
        <button type="button" onClick={onClose}
          className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
          取消
        </button>
      </div>
    </div>
  )
}
