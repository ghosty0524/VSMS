import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * 收合時按鈕上要顯示的字。
 *
 * 舊版一律顯示「已選 3 項」，使用者得把下拉點開才知道自己選了什麼，
 * 而篩選列上有四個這樣的下拉，等於要點四次才能確認目前的檢視條件。
 * 改成直接列出選了什麼；超過兩項時列前兩項再加「+N」，避免把篩選列撐爆。
 * 完整清單放在 title，滑鼠停留即可讀取。
 */
export function summarizeSelection(
  selected: string[],
  optionLabels?: Record<string, string>,
): string {
  if (selected.length === 0) return '全部'
  const names = selected.map(v => optionLabels?.[v] ?? v)
  if (names.length <= 2) return names.join('、')
  return `${names[0]}、${names[1]} +${names.length - 2}`
}

interface Props {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  minWidth?: number
  /** 選填：value → 顯示文字對照表（例如已停用項目加註「（已停用）」）。
   *  只影響顯示文字，比對／勾選／onChange 一律仍用原始 value。 */
  optionLabels?: Record<string, string>
}

export function MultiSelectDropdown({ label, options, selected, onChange, minWidth = 130, optionLabels }: Props) {
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

  const labelText = summarizeSelection(selected, optionLabels)
  const fullList = selected.length > 0
    ? selected.map(v => optionLabels?.[v] ?? v).join('、')
    : '未篩選，顯示全部'

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      <div className="relative">
        <button type="button"
          onClick={() => setOpen(o => !o)}
          title={`${label}：${fullList}`}
          className={`flex items-center justify-between gap-2 border rounded px-2 py-1 text-xs
                      bg-white hover:bg-gray-50 whitespace-nowrap max-w-[190px]
                      ${selected.length > 0
                        ? 'border-blue-400 text-blue-800'
                        : 'border-gray-300 text-gray-600'}`}
          style={{ minWidth }}
        >
          <span className="truncate">{labelText}</span>
          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
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
                {optionLabels?.[opt] ?? opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}