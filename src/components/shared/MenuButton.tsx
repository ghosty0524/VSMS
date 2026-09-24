// src/components/shared/MenuButton.tsx
//
// 「按鈕＋下拉選單」。工具列的「更多」與全域頂欄（UI 統一 4A）的產品切換、
// 使用者選單共用。
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
//
// 頂欄用的擴充（預設值都維持「更多」原本的樣子）：
// - trigger：按鈕內容換成任意節點（標誌＋文字、頭像＋名稱），▾ 仍附在後面。
// - align：'left' 讓清單左緣對齊按鈕左緣（產品切換在頂欄最左邊）。
// - header：清單頂端不可點的標頭（使用者名稱＋角色），同時當清單的 aria-describedby。
// - size：'md' 是頂欄的 13px 字、較高的列與較寬的清單。
// - 項目可以是連結（href）：交給瀏覽器導覽，中鍵／Ctrl+點開新分頁都照常；
//   也可以帶說明（description）、標成目前項目（current：打勾＋aria-current）、
//   在上方畫分隔線（separatorBefore）。
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  title?: string
  /** 按鈕項目：選單先關閉、焦點回按鈕，再呼叫。 */
  onSelect?: () => void
  /** 有值時項目是 <a href>，按下只關閉選單，導覽交給瀏覽器。 */
  href?: string
  /** 名稱下一行的說明（12px 淡字）。 */
  description?: string
  /** 目前所在的項目：右側打勾，並加 aria-current="page"。 */
  current?: boolean
  /** 在這一項上方畫分隔線。 */
  separatorBefore?: boolean
}

interface Props {
  label: string
  items: MenuItem[]
  ariaLabel?: string
  /** 觸發按鈕的樣式，沿用呼叫端的按鈕樣式。 */
  className?: string
  /** 觸發按鈕的內容；不給就顯示 label。▾ 一律附在後面。 */
  trigger?: ReactNode
  /** 清單對齊按鈕的哪一側。預設 'right'（工具列「更多」）。 */
  align?: 'left' | 'right'
  /** 清單頂端不可點的標頭。 */
  header?: ReactNode
  /** 'sm'：工具列（預設）；'md'：頂欄。 */
  size?: 'sm' | 'md'
}

const ITEM_CLASS = {
  sm: 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100',
  md: 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-800 whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100',
} as const

const MENU_MIN_WIDTH = { sm: 'min-w-[10rem]', md: 'min-w-[14rem]' } as const

export function MenuButton({
  label, items, ariaLabel, className, trigger, align = 'right', header, size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const menuId = useId()
  const headerId = useId()

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
    if (r) {
      const top = r.bottom + 4
      // 靠右：工具列可以橫向捲動，按鈕捲到局部露出視窗外時 r.right 可能超過 innerWidth，
      // 算出來會是負值把清單推到畫面外；下限夾在 4px（跟清單其他邊距一致）。
      // 靠左：同理，r.left 可能是負值，一樣夾在 4px。
      setPos(align === 'left'
        ? { top, left: Math.max(4, r.left) }
        : { top, right: Math.max(4, window.innerWidth - r.right) })
    }
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
    item.onSelect?.()
  }

  // 連結項目：只關閉，導覽交給瀏覽器。不把焦點搬回按鈕——頁面馬上就要換掉；
  // 用 Ctrl／中鍵開新分頁時，原頁的焦點也不需要跳走。
  const follow = () => setOpen(false)

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
        {trigger ?? label}
        <ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? label}
          aria-describedby={header ? headerId : undefined}
          onKeyDown={onMenuKeyDown}
          className={`fixed z-[110] ${MENU_MIN_WIDTH[size]} py-1 bg-white border border-slate-200 rounded-md shadow-lg`}
          style={{ top: pos.top, left: pos.left, right: pos.right }}
        >
          {header && (
            <div id={headerId} role="none" className="px-3 pt-1.5 pb-2 mb-1 border-b border-slate-200">
              {header}
            </div>
          )}
          {items.map((item, i) => {
            const body = (
              <>
                {item.icon}
                {item.description
                  ? (
                    <span className="flex min-w-0 flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-slate-500">{item.description}</span>
                    </span>
                  )
                  : item.label}
                {item.current && (
                  <Check size={14} aria-hidden="true" className="ml-auto flex-shrink-0 text-blue-600" />
                )}
              </>
            )
            const shared = {
              role: 'menuitem',
              tabIndex: i === active ? 0 : -1,
              title: item.title,
              'aria-current': item.current ? ('page' as const) : undefined,
              className: ITEM_CLASS[size],
            }
            return (
              <Fragment key={item.key}>
                {item.separatorBefore && (
                  <div role="separator" className="my-1 border-t border-slate-200" />
                )}
                {item.href !== undefined
                  ? (
                    <a {...shared} ref={el => { itemRefs.current[i] = el }} href={item.href} onClick={follow}>
                      {body}
                    </a>
                  )
                  : (
                    <button {...shared} ref={el => { itemRefs.current[i] = el }} type="button"
                            onClick={() => select(item)}>
                      {body}
                    </button>
                  )}
              </Fragment>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
