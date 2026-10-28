import AppLockScreen from '@/components/AppLockScreen'
import { AppLockController, UserBookmarkController, UserTagController } from '@/controllers'
import { auth } from '@/lib/auth'
import { PageRoutes } from '@cfg'
import { redirect } from 'next/navigation'
import { PropsWithChildren } from 'react'
import UserLayoutShell from './UserLayoutShell'
import { UserContextProvider } from './ctx'

export const generateMetadata = async () => {
  const session = await auth()
  const userName = session?.user.name || session?.user.email || '用户'
  return {
    title: {
      default: '个人空间 - ' + userName,
      template: '%s - ' + userName,
    },
  }
}

export default async function UserLayout(props: PropsWithChildren) {
  const session = await auth()
  const user = session?.user
  const userId = user?.id
  if (!user || !userId) {
    redirect(PageRoutes.LOGIN)
  }

  const gate = await AppLockController.getGateState(userId)

  if (gate.enabled && !gate.unlocked) {
    return (
      <AppLockScreen
        user={{
          name: user.name || '',
          email: user.email || '',
          image: user.image,
        }}
        method={gate.method!}
      />
    )
  }

  const [tags, totalBookmarks] = await Promise.all([
    UserTagController.getAll(),
    UserBookmarkController.total(),
  ])

  return (
    <UserContextProvider tags={tags} totalBookmarks={totalBookmarks}>
      <UserLayoutShell tags={tags} totalBookmarks={totalBookmarks}>
        {props.children}
      </UserLayoutShell>
    </UserContextProvider>
  )
}
