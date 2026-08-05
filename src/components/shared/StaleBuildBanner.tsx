// src/components/shared/StaleBuildBanner.tsx
// 非阻斷式提示：偵測到伺服器正在服務的前端版本跟這個分頁載入時不同，
// 顯示一條可關閉的提示列，並提供「重新整理」按鈕（只是 window.location.reload()，
// 絕不自動重整——使用者可能正在表單中間輸入，自動重整會弄丟輸入內容）。
import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useStaleBuildNotice } from './useStaleBuildNotice'

export function StaleBuildBanner() {
  const isStale = useStaleBuildNotice()
  const [dismissed, setDismissed] = useState(false)

  if (!isStale || dismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
        bg-gray-900 text-white text-sm rounded-lg shadow-lg px-4 py-2.5"
    >
      <span>有新版本可用，重新整理即可取得最新內容</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10
          hover:bg-white/20 font-medium transition-colors"
      >
        <RefreshCw size={14} />
        重新整理
      </button>
      <button
        type="button"
        aria-label="關閉"
        onClick={() => setDismissed(true)}
        className="text-white/60 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  )
}
