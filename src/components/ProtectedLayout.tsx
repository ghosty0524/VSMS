// src/components/ProtectedLayout.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { LoadingScreen } from './shared/LoadingScreen'

interface Props { children: React.ReactNode }

export function ProtectedLayout({ children }: Props) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const [ready, setReady] = useState(false)
  // 初始化失敗的訊息。以前失敗只 console.error，畫面會永遠停在「載入資料中…」。
  const [initError, setInitError] = useState<string | null>(null)
  const initRef = useRef(false)

  const runInit = useCallback(() => {
    if (initRef.current) return
    initRef.current = true
    setInitError(null)

    const initSchedules = useScheduleStore.getState().init
    const initOptions = useOptionsStore.getState().init

    Promise.all([initSchedules(), initOptions()])
      .then(() => setReady(true))
      .catch(err => {
        console.error('Init failed:', err)
        initRef.current = false
        setInitError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  useEffect(() => {
    if (!isLoggedIn) {
      initRef.current = false
      setReady(false)
      setInitError(null)
      return
    }
    runInit()
  }, [isLoggedIn, runInit])

  const retry = () => {
    initRef.current = false
    runInit()
  }

  if (!isLoggedIn) return null
  if (!ready) {
    return initError !== null
      ? <LoadingScreen text="無法載入排程資料" error={initError} onRetry={retry} />
      : <LoadingScreen text="載入資料中…" />
  }
  return <>{children}</>
}
