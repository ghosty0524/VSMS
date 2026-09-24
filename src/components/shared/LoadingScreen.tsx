import { ListStateFailure } from './ListState'

interface Props {
  text: string
  /** 有值（包含空字串）時不轉圈，改顯示失敗狀態：標題用 text，錯誤訊息放小字。 */
  error?: string
  /** 失敗狀態的「重試」；沒給就不顯示按鈕。 */
  onRetry?: () => void
}

/** 全頁載入畫面：spinner + 說明文字；傳入 error 時改為全頁失敗狀態 */
export function LoadingScreen({ text, error, onRetry }: Props) {
  if (error !== undefined) {
    return (
      <div className="h-screen flex flex-col items-center justify-center app-ground">
        <ListStateFailure title={text} message={error} onRetry={onRetry} />
      </div>
    )
  }
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 app-ground">
      <div className="w-8 h-8 rounded-full border-[3px] border-slate-300 border-t-blue-500 animate-spin" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  )
}
