interface Props { text: string }

/** 全頁載入畫面：spinner + 說明文字 */
export function LoadingScreen({ text }: Props) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 bg-gray-100">
      <div className="w-8 h-8 rounded-full border-[3px] border-slate-300 border-t-blue-500 animate-spin" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  )
}
