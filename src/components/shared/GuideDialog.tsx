import { useEffect, useRef } from 'react'
import { useEscapeKey } from './useEscapeKey'

/**
 * 「使用說明」對話框（與 VTMS 同一做法，2026-10-02）：在 VSMS 內用 iframe 載入入口頁的說明
 * （同源，共用 SSO cookie），關閉後畫面與操作狀態都不變。網址帶 ?embed=1，入口頁只畫說明內容、
 * 不畫自己的頂欄與側欄（vportal lib/embed.ts）。右上保留「在新分頁開啟」。
 * Esc、關閉鈕、點遮罩都會關閉；關閉後焦點回到開啟前的元素。
 */
export function guideEmbedUrl(href: string): string {
  const hashAt = href.indexOf('#')
  const path = hashAt >= 0 ? href.slice(0, hashAt) : href
  const hash = hashAt >= 0 ? href.slice(hashAt) : ''
  return `${path}${path.includes('?') ? '&' : '?'}embed=1${hash}`
}

interface Props {
  /** 說明中心的深連結，例如 /guide/vsms/schedules。 */
  href: string
  onClose: () => void
}

export function GuideDialog({ href, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEscapeKey(true, onClose)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => { opener?.focus?.() }
  }, [])

  return (
    <div
      data-testid="guide-dialog-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="使用說明"
        className="flex flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ width: 'min(1100px, 96vw)', height: 'min(860px, 90vh)' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <h2 className="m-0 text-base font-semibold text-gray-800">使用說明</h2>
          <div className="flex items-center gap-2">
            <a
              href={href}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              在新分頁開啟
            </a>
            <button
              ref={closeRef}
              type="button"
              aria-label="關閉"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              ✕
            </button>
          </div>
        </div>
        <iframe title="使用說明" src={guideEmbedUrl(href)} className="w-full flex-1 border-0 bg-white" />
      </section>
    </div>
  )
}
