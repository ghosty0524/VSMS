import { useEffect, useRef } from 'react'
import { useEscapeKey } from './useEscapeKey'

interface Props {
  isOpen: boolean
  title?: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function DeleteConfirmDialog({
  isOpen, title = '確認刪除', message,
  confirmLabel = '確認刪除', onConfirm, onCancel, danger = true,
}: Props) {
  useEscapeKey(isOpen, onCancel)
  // 焦點預設落在「取消」，避免誤按 Enter 直接刪除
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus()
  }, [isOpen])

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} ref={cancelRef}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50
                       focus:outline-none focus:ring-2 focus:ring-blue-400">
            取消
          </button>
          <button type="button" onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
