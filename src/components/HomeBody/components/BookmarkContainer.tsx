import { useUserPreferences } from '@/components/UserPreferenceProvider'
import { cn } from '@heroui/react'
import { PropsWithChildren, useLayoutEffect, useRef } from 'react'
import { useHomePageContext } from '../ctx'

export default function BookmarkContainer({ children }: PropsWithChildren) {
  const divRef = useRef<HTMLDivElement>(null)
  const { bookmarks } = useHomePageContext()
  const { mobileBookmarkLayout } = useUserPreferences()

  useLayoutEffect(() => {
    if (!divRef.current) return
    setTimeout(() => {
      divRef.current!.classList.add('transition-all')
      divRef.current!.classList.add('opacity-100!')
      divRef.current!.classList.add('translate-y-0!')
      divRef.current!.style.translate = '0'
    }, 10)
  }, [bookmarks])

  return (
    <div
      ref={divRef}
      className={cn(
        'xs:gap-8 grid translate-y-16 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-5 opacity-0 duration-300',
        mobileBookmarkLayout === 'two-columns' && 'max-xs:grid-cols-2 max-xs:gap-3',
        mobileBookmarkLayout === 'three-columns' && 'max-xs:grid-cols-3 max-xs:gap-2.5'
      )}
    >
      {children}
    </div>
  )
}
