// src/components/shared/MenuButton.tsx
//
// 「按鈕＋下拉選單」，工具列的「更多」用。
//
// 清單 portal 到 document.body 並用 position: fixed 對齊按鈕：工具列容器是
// overflow-x-auto，會連帶讓縱向也變成裁切，清單放在裡面會被切掉。全螢幕時甘特圖
// 容器是 fixed inset-0 z-[100]，所以清單是 z-[110]；全螢幕作用在整份文件
// （requestFullscreen 在 documentElement 上），掛在 body 仍看得到。
//
// Esc 在清單上處理並 stopPropagation：甘特圖的覆蓋式全螢幕（瀏覽器拒絕真全螢幕時）
// 在 window 上聽 Esc 來離開，選單的 Esc 不能漏上去。瀏覽器真全螢幕時 Esc 由瀏覽器
// 自己攔下離開全螢幕，網頁擋不住；離開全螢幕會 resize，選單因此自動關閉。
//
// Tab 也不能只是關閉：清單 portal 在 body 最後面，若放任瀏覽器照 DOM 順序走，
// Tab 會直接離開文件（後面沒別的節點了），Shift+Tab 會跳到 #root 內最後一個可
// 聚焦元素，都不是「接著觸發按鈕」的位置。做法是在 keydown 當下同步把焦點搬回
// 按鈕、且不 preventDefault：瀏覽器算下一個 tab stop 是看事件處理完當下的
// activeElement，所以會從按鈕接著走，Tab 到「更多」後面那個、Shift+Tab 到前面那個。
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  title?: string
  onSelect: () => void
}

interface Props {
  label: string
  items: MenuItem[]
  ariaLabel?: string
  /** 觸發按鈕的樣式，沿用呼叫端的按鈕樣式。 */
  className?: string
}

export function MenuButton({ label, items, ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  const count = items.length

  // 項目被拿光（例如切回甘特圖、沒有可複製的表格）時，不要留著一個打開的狀態，
  // 等項目回來時憑空彈出來。
  useEffect(() => { if (count === 0) setOpen(false) }, [count])

  useLayoutEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    // 位置是開啟當下量的；版面一動就關掉，不追著重算。
    const onLayoutChange = () => setOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('scroll', onLayoutChange, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('scroll', onLayoutChange, true)
    }
  }, [open])

  if (count === 0) return null

  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = buttonRef.current?.getBoundingClientRect()
    // 工具列可以橫向捲動，按鈕捲到局部露出視窗外時 r.right 可能超過 innerWidth，
    // 算出來會是負值把清單推到畫面外；下限夾在 4px（跟清單其他邊距一致）。
    if (r) setPos({ top: r.bottom + 4, right: Math.max(4, window.innerWidth - r.right) })
    setActive(0)
    setOpen(true)
  }

  const closeAndRefocus = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const select = (item: MenuItem) => {
    // 先把焦點還給按鈕再執行：onSelect 常會開 Modal，Modal 拿到焦點後不該再被搶回來。
    closeAndRefocus()
    item.onSelect()
  }

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(i => (i + 1) % count); break
      case 'ArrowUp':   e.preventDefault(); setActive(i => (i - 1 + count) % count); break
      case 'Home':      e.preventDefault(); setActive(0); break
      case 'End':       e.preventDefault(); setActive(count - 1); break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeAndRefocus()
        break
      case 'Tab':
        // 不 preventDefault：關閉選單、把焦點同步移回觸發按鈕，再讓瀏覽器接手
        // 預設的 Tab 行為（見檔頭註解）。
        closeAndRefocus()
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={toggle}
        className={className}
      >
        {label}
        <ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? label}
          onKeyDown={onMenuKeyDown}
          className="fixed z-[110] min-w-[10rem] py-1 bg-white border border-slate-200 rounded-md shadow-lg"
          style={{ top: pos.top, right: pos.right }}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              title={item.title}
              onClick={() => select(item)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700
                         whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
