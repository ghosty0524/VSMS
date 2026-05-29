// src/components/ProtectedLayout.tsx
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'

interface Props { children: React.ReactNode }

export function ProtectedLayout({ children }: Props) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const [ready, setReady] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    if (!isLoggedIn) {
      initRef.current = false
      setReady(false)
      return
    }
    if (initRef.current) return
    initRef.current = true

    const initSchedules = useScheduleStore.getState().init
    const initOptions = useOptionsStore.getState().init

    Promise.all([initSchedules(), initOptions()])
      .then(() => setReady(true))
      .catch(err => {
        console.error('Init failed:', err)
        initRef.current = false
      })
  }, [isLoggedIn])

  if (!isLoggedIn) return null
  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-400 text-sm">載入資料中…</p>
      </div>
    )
  }
  return <>{children}</>
}