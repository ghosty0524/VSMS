import { useState, useRef, useEffect } from 'react'

interface Props {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  minWidth?: number
}

export function MultiSelectDropdown({ label, options, selected, onChange, minWidth = 130 }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter(x => x !== val)
      : [...selected, val]
    onChange(next)
  }

  const labelText = selected.length === 0 ? '全部' : `已選 ${selected.length} 項`

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      <div className="relative">
        <button type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center justify-between gap-2 border border-gray-300 rounded px-2 py-1 text-xs bg-white hover:bg-gray-50 whitespace-nowrap"
          style={{ minWidth }}
        >
          <span>{labelText}</span>
          <span className="text-gray-400">▾</span>
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50"
            style={{ minWidth: Math.max(minWidth, 160), maxHeight: 220, overflowY: 'auto' }}>
            {options.map(opt => (
              <label key={opt}
                className="flex items-center gap-1 px-2 cursor-pointer hover:bg-gray-50 whitespace-nowrap"
                style={{ height: 22, fontSize: 12, padding: '1px 8px' }}>
                <input
                  type="checkbox"
                  className="w-3 h-3"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}