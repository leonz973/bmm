'use client'

import { actLockApp } from '@/actions'
import { APP_LOCK_ACTIVITY_KEY, APP_LOCK_IDLE_MS } from '@/lib/app-lock-constants'
import { runAction } from '@/utils/client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/** 空闲检查间隔 */
const IDLE_CHECK_INTERVAL_MS = 30 * 1000

function readLastActive(activityKey: string) {
  try {
    const raw = window.localStorage.getItem(activityKey)
    const value = raw ? Number(raw) : 0
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

interface Props {
  userId: string
}

export function AppLockIdleGuard(props: Props) {
  const router = useRouter()
  const lockingRef = useRef(false)
  const lastActiveRef = useRef(0)
  const activityKey = `${APP_LOCK_ACTIVITY_KEY}:${props.userId}`

  useEffect(() => {
    function markActive() {
      const now = Date.now()
      lastActiveRef.current = now
      try {
        window.localStorage.setItem(activityKey, String(now))
      } catch {
        // 隐私模式等场景下 localStorage 不可用，内存中的时间仍可兜底
      }
    }

    async function lockIfIdle() {
      if (lockingRef.current) return false
      const lastActive = Math.max(lastActiveRef.current, readLastActive(activityKey))
      if (!lastActive) {
        markActive()
        return false
      }
      if (Date.now() - lastActive < APP_LOCK_IDLE_MS) return false

      lockingRef.current = true
      const result = await runAction(actLockApp(), { errToast: { hidden: true } })
      lockingRef.current = false
      if (!result.ok) return false

      markActive()
      router.refresh()
      return true
    }

    lastActiveRef.current = readLastActive(activityKey)
    void lockIfIdle()

    function handleActivity() {
      markActive()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        markActive()
        return
      }
      void lockIfIdle().then((locked) => {
        if (!locked) markActive()
      })
    }

    const timer = window.setInterval(() => {
      void lockIfIdle()
    }, IDLE_CHECK_INTERVAL_MS)

    window.addEventListener('pointerdown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('wheel', handleActivity, { passive: true })
    window.addEventListener('touchstart', handleActivity, { passive: true })
    document.addEventListener('scroll', handleActivity, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pointerdown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('wheel', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      document.removeEventListener('scroll', handleActivity, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activityKey, router])

  return null
}

export default AppLockIdleGuard
