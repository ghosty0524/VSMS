// src/components/shared/SegmentedControl.tsx
// 二到三選一的分段控制。
//
// 系統裡原本有三套各自實作的同類東西：甘特圖的「甘特圖／列表」與「按工程師／
// 按設備」（深色分段式）、統計頁的「月／季／年」與「人員／單位」（深色分段式，
// 但尺寸與圓角不同）、系統設定的分頁（資料夾式）。三者行為相同、長相不同。
// 這裡統一成一個元件，後續逐步替換。

interface Option<T extends string> {
  value: T
  label: string
  /** 選填圖示，放在文字左側 */
  icon?: React.ReactNode
  title?: string
  /** 個別停用。用於「這一段由別的系統控制、那一段仍可操作」的情況。 */
  disabled?: boolean
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  /** sm 用於工具列，md 用於內容區 */
  size?: 'sm' | 'md'
  ariaLabel: string
}

export function SegmentedControl<T extends string>({
  options, value, onChange, size = 'sm', ariaLabel,
}: Props<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5'

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-shrink-0 rounded-md border border-slate-300 overflow-hidden
                 text-xs font-medium whitespace-nowrap"
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1 transition-colors ${pad}
              ${i > 0 ? 'border-l border-slate-300' : ''}
              ${o.disabled ? 'cursor-not-allowed opacity-45' : ''}
              ${selected
                ? 'bg-slate-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
