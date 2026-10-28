import { db, schema } from '@/db'
import { clearAppUnlockCookie, isAppUnlocked, setAppUnlocked } from '@/lib/app-lock'
import { auth } from '@/lib/auth'
import { z } from '@/lib/zod'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import CredentialsController from './Credentials.controller'

const APP_LOCK_KEY = 'user.appLock'

export const APP_LOCK_METHODS = ['pattern', 'pin'] as const
export type AppLockMethod = (typeof APP_LOCK_METHODS)[number]

export const appLockConfigSchema = z.object({
  method: z.enum(APP_LOCK_METHODS),
  secret: z.string(),
})

export const appLockVerifySchema = z.object({
  secret: z.string().min(1, '请输入解锁密码'),
})

export const appLockResetSchema = z.object({
  password: z.string().min(1, '请输入账号密码'),
})

const appLockStoredSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(APP_LOCK_METHODS),
  hash: z.string(),
  salt: z.string(),
})

type AppLockStored = z.output<typeof appLockStoredSchema>

export interface AppLockSettings {
  enabled: boolean
  method: AppLockMethod | null
}

export interface AppLockGateState extends AppLockSettings {
  unlocked: boolean
}

function normalizeSecret(method: AppLockMethod, secret: string) {
  if (method === 'pin') {
    if (!/^\d{4}$/.test(secret)) {
      throw new Error('请输入 4 位数字密码')
    }
    return secret
  }

  const points = secret.split(',').map(Number)
  if (
    points.length < 4 ||
    points.length > 9 ||
    points.some((point) => !Number.isInteger(point) || point < 0 || point > 8) ||
    new Set(points).size !== points.length
  ) {
    throw new Error('请至少连接 4 个不重复的点')
  }
  return points.join(',')
}

function hashSecret(secret: string, salt: string) {
  return crypto.scryptSync(secret, salt, 32).toString('hex')
}

function verifySecret(secret: string, stored: AppLockStored) {
  const expected = Buffer.from(hashSecret(secret, stored.salt), 'hex')
  const actual = Buffer.from(stored.hash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

async function getSessionUserId(): Promise<string> {
  const session = await auth()
  const userId = session?.user.id
  if (!userId) throw new Error('请先登录')
  return userId
}

async function findStoredConfig(userId: UserId) {
  const row = await db.query.userConfigs.findFirst({
    where: and(eq(schema.userConfigs.userId, userId), eq(schema.userConfigs.key, APP_LOCK_KEY)),
  })
  if (!row) return null

  const result = appLockStoredSchema.safeParse(row.value)
  return result.success ? result.data : null
}

const AppLockController = {
  async getSettings(userId?: UserId): Promise<AppLockSettings> {
    const targetUserId = userId || (await getSessionUserId())
    const stored = await findStoredConfig(targetUserId)
    return stored?.enabled
      ? { enabled: true, method: stored.method }
      : { enabled: false, method: null }
  },

  /** 服务端布局使用：返回是否开启、解锁方式以及当前请求是否已解锁 */
  async getGateState(userId: UserId): Promise<AppLockGateState> {
    const stored = await findStoredConfig(userId)
    if (!stored?.enabled) {
      return { enabled: false, method: null, unlocked: true }
    }
    return {
      enabled: true,
      method: stored.method,
      unlocked: await isAppUnlocked(userId),
    }
  },

  async save(input: z.output<typeof appLockConfigSchema>): Promise<AppLockSettings> {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    const secret = normalizeSecret(input.method, input.secret)
    const salt = crypto.randomBytes(16).toString('hex')
    const value: AppLockStored = {
      enabled: true,
      method: input.method,
      hash: hashSecret(secret, salt),
      salt,
    }

    await db
      .insert(schema.userConfigs)
      .values({
        userId: session.user.id,
        key: APP_LOCK_KEY,
        value,
        description: '应用锁设置',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.userConfigs.userId, schema.userConfigs.key],
        set: { value, updatedAt: new Date() },
      })

    // 刚设置成功时视为已通过校验，避免立刻把当前会话锁在门外
    await setAppUnlocked(session.user.id)
    return { enabled: true, method: input.method }
  },

  async disable(): Promise<AppLockSettings> {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    await db
      .delete(schema.userConfigs)
      .where(
        and(
          eq(schema.userConfigs.userId, session.user.id),
          eq(schema.userConfigs.key, APP_LOCK_KEY)
        )
      )
    await clearAppUnlockCookie()
    return { enabled: false, method: null }
  },

  async verify(input: z.output<typeof appLockVerifySchema>) {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    const stored = await findStoredConfig(session.user.id)
    if (!stored?.enabled) {
      return { verified: true }
    }
    if (!verifySecret(input.secret, stored)) {
      throw new Error('解锁密码错误，请重试')
    }

    await setAppUnlocked(session.user.id)
    return { verified: true }
  },

  /** 忘记解锁密码时，用账号密码关闭应用锁 */
  async resetWithPassword(input: z.output<typeof appLockResetSchema>) {
    const session = await auth()
    if (!session?.user.id || !session.user.email) throw new Error('请先登录')

    await CredentialsController.verify({
      email: session.user.email,
      password: input.password,
    })

    await db
      .delete(schema.userConfigs)
      .where(
        and(
          eq(schema.userConfigs.userId, session.user.id),
          eq(schema.userConfigs.key, APP_LOCK_KEY)
        )
      )
    await setAppUnlocked(session.user.id)
    return { enabled: false }
  },

  /** 立即上锁：清除当前浏览器的解锁凭据 */
  async lock() {
    await clearAppUnlockCookie()
    return { locked: true }
  },
}

export default AppLockController
