import { AppLockController } from '@/controllers'
import { DEFAULT_APP_LOCK_IDLE_MINUTES } from '@/lib/app-lock-constants'
import { auth } from '@/lib/auth'
import ClientPage from './ClientPage'

export const metadata = {
  title: '偏好设置',
}

export default async function Page() {
  const session = await auth()
  const userId = session?.user.id
  const appLock = userId
    ? await AppLockController.getSettings(userId)
    : {
        enabled: false,
        method: null,
        idleMinutes: DEFAULT_APP_LOCK_IDLE_MINUTES,
      }

  return (
    <ClientPage
      user={{
        name: session?.user.name || '',
        image: session?.user.image || '',
        email: session?.user.email || '',
      }}
      appLock={appLock}
    />
  )
}
