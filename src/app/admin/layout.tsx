import AppLockScreen from '@/components/AppLockScreen'
import CmsLayout from '@/components/CmsLayout'
import { AppLockController, PublicBookmarkController, PublicTagController } from '@/controllers'
import UserController from '@/controllers/User.controller'
import { auth } from '@/lib/auth'
import { PageRoutes, WEBSITE_NAME } from '@cfg'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { AdminProvider } from './ctx'

export const metadata: Metadata = {
  title: {
    default: '后台数据管理 - ' + WEBSITE_NAME + ' CMS',
    template: '%s - ' + WEBSITE_NAME + ' CMS',
  },
}

export default async function AdminLayout(props: PropsWithChildren) {
  const session = await auth()
  const user = session?.user
  const userId = user?.id

  if (!user || !userId) {
    redirect(PageRoutes.LOGIN)
  }

  if (!user.isAdmin) {
    redirect(PageRoutes.FORBIDDEN)
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

  const [tags, total, totalUsers] = await Promise.all([
    PublicTagController.getAll(),
    PublicBookmarkController.total(),
    UserController.count(),
  ])

  return (
    <AdminProvider tags={tags} totalBookmarks={total} totalUsers={totalUsers}>
      <CmsLayout mode="admin">{props.children}</CmsLayout>
    </AdminProvider>
  )
}
