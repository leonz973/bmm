'use client'

import { actUpdateUserPreferences } from '@/actions'
import type { MobileBookmarkLayout } from '@/controllers'
import { runAction } from '@/utils/client'
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react'

interface UserPreferenceContextValue {
  mobileBookmarkLayout: MobileBookmarkLayout
  updateMobileBookmarkLayout(layout: MobileBookmarkLayout): Promise<boolean>
}

const UserPreferenceContext = createContext<UserPreferenceContextValue | null>(null)

export function useUserPreferences() {
  const ctx = useContext(UserPreferenceContext)
  if (!ctx) throw new Error('useUserPreferences 必须在 UserPreferenceProvider 中使用')
  return ctx
}

interface Props extends PropsWithChildren {
  initialLayout: MobileBookmarkLayout
}

export function UserPreferenceProvider(props: Props) {
  const [mobileBookmarkLayout, setMobileBookmarkLayout] = useState(props.initialLayout)

  const value = useMemo<UserPreferenceContextValue>(
    () => ({
      mobileBookmarkLayout,
      async updateMobileBookmarkLayout(layout) {
        const previous = mobileBookmarkLayout
        setMobileBookmarkLayout(layout)
        const res = await runAction(actUpdateUserPreferences({ mobileBookmarkLayout: layout }))
        if (!res.ok) {
          setMobileBookmarkLayout(previous)
          return false
        }
        return true
      },
    }),
    [mobileBookmarkLayout]
  )

  return (
    <UserPreferenceContext.Provider value={value}>{props.children}</UserPreferenceContext.Provider>
  )
}
