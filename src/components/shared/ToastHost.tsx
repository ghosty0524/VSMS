// src/components/shared/ToastHost.tsx
// 全站唯一的通知渲染點，由 App 掛一次。內容從 Header 的原始實作搬過來，
// 三套通知現在共用這一個佇列，因此會依序往下堆而不是互相遮蔽。
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore, type ToastKind } from '../../store/toastStore'

const STYLE: Record<ToastKind, string> = {
  success: 'bg-white border-green-200 text-green-800',
  error:   'bg-white border-red-200   text-red-800',
  info:    'bg-white border-blue-200  text-blue-800',
  loading: 'bg-white border-slate-200 text-slate-700',
}

export function ToastHost() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-5 py-3 text-sm font-medium
                      border rounded-xl shadow-xl pointer-events-auto
                      animate-fade-in min-w-[260px] max-w-[420px]
                      ${STYLE[t.kind]}`}
        >
          {t.kind === 'loading' ? (
            <svg className="animate-spin w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5"
                 fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <span className="flex-shrink-0 mt-0.5" aria-hidden="true">
              {t.kind === 'success' && <CheckCircle2 size={16} />}
              {t.kind === 'error'   && <AlertTriangle size={16} />}
              {t.kind === 'info'    && <Info size={16} />}
            </span>
          )}
          <span className="flex-1 whitespace-pre-line">{t.text}</span>
          {t.kind !== 'loading' && (
            <button
              type="button"
              aria-label="關閉通知"
              onClick={() => dismiss(t.id)}
              className="opacity-40 hover:opacity-70 flex-shrink-0 ml-1 mt-0.5"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
