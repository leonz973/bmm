import { cookies, headers } from 'next/headers'
import { APP_LOCK_COOKIE_NAME } from './app-lock-constants'
import { createSignedToken, readSignedToken } from './signed-token'

interface AppLockToken {
  type: 'app-lock'
  userId: string
  issuedAt: number
}

function isAppLockToken(value: unknown): value is AppLockToken {
  if (!value || typeof value !== 'object') return false
  const token = value as Partial<AppLockToken>
  return (
    token.type === 'app-lock' &&
    typeof token.userId === 'string' &&
    typeof token.issuedAt === 'number'
  )
}

/**
 * 读取当前请求的解锁 Cookie 并校验其确实属于当前用户。
 * Cookie 不设置 maxAge，浏览器关闭后即失效；长时间未使用由前端空闲计时器重新上锁。
 */
export async function isAppUnlocked(userId: string) {
  const cookieStore = await cookies()
  const raw = cookieStore.get(APP_LOCK_COOKIE_NAME)?.value
  if (!raw) return false

  const token = readSignedToken<AppLockToken>(raw)
  return isAppLockToken(token) && token.userId === userId
}

async function isHttpsRequest() {
  const headerStore = await headers()
  const forwardedProto = headerStore.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwardedProto) return forwardedProto === 'https'

  // 兼容未配置反向代理头、但显式配置了 HTTPS AUTH_URL 的部署
  return process.env.AUTH_URL?.startsWith('https://') ?? false
}

export async function setAppUnlocked(userId: string) {
  const cookieStore = await cookies()
  const token = createSignedToken({
    type: 'app-lock',
    userId,
    issuedAt: Date.now(),
  } satisfies AppLockToken)

  cookieStore.set({
    name: APP_LOCK_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    // 站点可能部署在 HTTP 内网/NAS 上，仅在确认 HTTPS 时加 Secure，避免 Cookie 被浏览器丢弃
    secure: await isHttpsRequest(),
    path: '/',
  })
}

export async function clearAppUnlockCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(APP_LOCK_COOKIE_NAME)
}
