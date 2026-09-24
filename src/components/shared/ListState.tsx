// src/components/shared/ListState.tsx
// 列表區塊的「載入中／沒有資料／篩選後沒結果／讀取失敗」（UI 統一第 3 項 E）。
//
// 判斷順序寫死在這裡，呼叫端只提供事實（loading、error、count、filtered），不自己
// 排先後。以前各處自己排，才會出現「還在讀、或讀取失敗，畫面卻顯示沒有資料」。
//
// 錯誤通知方式不在這裡統一：VSMS 照舊用 toast，這個元件只管列表區塊本身顯示什麼。
import type { ReactNode } from 'react'

export interface ListStateProps {
  /** 名詞，例如「排程」。 */
  noun: string
  /** 正在讀取（包含「還沒讀過」）。 */
  loading: boolean
  /** 讀取失敗的訊息；沒有錯誤時為 null 或 undefined。 */
  error?: string | null
  /** 目前可顯示的筆數（已套用篩選）。 */
  count: number
  /** 是否有篩選或搜尋條件在作用（決定「目前沒有」或「沒有符合條件的」）。 */
  filtered?: boolean
  /** 有提供才顯示「清除篩選」按鈕。 */
  onClearFilters?: () => void
  /** 清除按鈕的文字，預設「清除篩選」。 */
  clearLabel?: string
  /** 有提供才顯示「重試」按鈕。 */
  onRetry?: () => void
  /** 「目前沒有」時的下一步動作（例如新增按鈕）。 */
  emptyAction?: ReactNode
  compact?: boolean
  /** count > 0 時顯示的內容。 */
  children: ReactNode
}

/** VSMS 次要按鈕（與工具列的「更多」同一組框線與底色） */
const BUTTON = 'border border-slate-300 bg-white text-slate-600 rounded-md text-xs px-3 py-1.5 hover:bg-slate-50 transition-colors'

function boxClass(compact?: boolean): string {
  return `flex flex-col items-center justify-center text-center ${compact ? 'px-3 py-4' : 'p-10'}`
}

function titleClass(compact?: boolean): string {
  return `${compact ? 'text-sm' : 'text-base'} font-medium`
}

interface FailureProps {
  title: string
  /** 原始錯誤訊息；空字串或沒有時不顯示小字。 */
  message?: string | null
  onRetry?: () => void
  compact?: boolean
}

/**
 * 失敗狀態本體。ListState 的第 2 種情況與 LoadingScreen 的全頁失敗畫面共用
 * 這一份，兩處的外觀才會一致。
 */
export function ListStateFailure({ title, message, onRetry, compact }: FailureProps) {
  return (
    <div role="alert" className={boxClass(compact)}>
      <p className={`${titleClass(compact)} text-red-700`}>{title}</p>
      {message && <p className="mt-1 max-w-md break-words text-xs text-gray-500">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${compact ? 'mt-2' : 'mt-3'} ${BUTTON}`}>
          重試
        </button>
      )}
    </div>
  )
}

export function ListState({
  noun, loading, error, count, filtered, onClearFilters, clearLabel = '清除篩選',
  onRetry, emptyAction, compact, children,
}: ListStateProps) {
  const failed = error !== null && error !== undefined

  // 1. 有資料：一律顯示資料。loading 時照常顯示（重新整理不閃爍）；重新整理失敗
  //    時在資料上方加一條錯誤提示，不藏掉已經有的資料。
  if (count > 0) {
    if (!failed) return <>{children}</>
    return (
      <>
        <div role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700">無法載入{noun}</p>
            {error && <p className="mt-0.5 break-words text-xs text-gray-500">{error}</p>}
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className={`shrink-0 ${BUTTON}`}>重試</button>
          )}
        </div>
        {children}
      </>
    )
  }

  // 2. 沒有資料且讀取失敗：只顯示失敗狀態。
  if (failed) {
    return <ListStateFailure title={`無法載入${noun}`} message={error} onRetry={onRetry} compact={compact} />
  }

  // 3. 沒有資料且還在讀：只顯示「載入中…」。
  if (loading) {
    return (
      <div role="status" className={boxClass(compact)}>
        <p className="text-sm text-gray-500">載入中…</p>
      </div>
    )
  }

  // 4. 篩選後沒結果。
  if (filtered) {
    return (
      <div role="status" className={boxClass(compact)}>
        <p className={`${titleClass(compact)} text-gray-600`}>沒有符合條件的{noun}</p>
        {onClearFilters && (
          <button type="button" onClick={onClearFilters} className={`${compact ? 'mt-2' : 'mt-3'} ${BUTTON}`}>
            {clearLabel}
          </button>
        )}
      </div>
    )
  }

  // 5. 真的沒有。
  return (
    <div role="status" className={boxClass(compact)}>
      <p className={`${titleClass(compact)} text-gray-600`}>目前沒有{noun}</p>
      {emptyAction && <div className={compact ? 'mt-2' : 'mt-3'}>{emptyAction}</div>}
    </div>
  )
}
