import { db, schema } from '@/db'
import { clearAppUnlockCookie, isAppUnlocked, setAppUnlocked } from '@/lib/app-lock'
import { DEFAULT_APP_LOCK_IDLE_MINUTES, type AppLockIdleMinutes } from '@/lib/app-lock-constants'
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

export const appLockDisableSchema = z.object({
  secret: z.string().optional(),
  password: z.string().optional(),
})

export const appLockIdleSchema = z.object({
  idleMinutes: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(30)]),
})

const appLockStoredSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(APP_LOCK_METHODS),
  hash: z.string(),
  salt: z.string(),
  /** 旧配置没有该字段时按默认 30 分钟处理 */
  idleMinutes: z
    .union([z.literal(1), z.literal(5), z.literal(10), z.literal(30)])
    .default(DEFAULT_APP_LOCK_IDLE_MINUTES),
})

type AppLockStored = z.output<typeof appLockStoredSchema>

export interface AppLockSettings {
  enabled: boolean
  method: AppLockMethod | null
  idleMinutes: AppLockIdleMinutes
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
      ? { enabled: true, method: stored.method, idleMinutes: stored.idleMinutes }
      : { enabled: false, method: null, idleMinutes: DEFAULT_APP_LOCK_IDLE_MINUTES }
  },

  /** 服务端布局使用：返回是否开启、解锁方式以及当前请求是否已解锁 */
  async getGateState(userId: UserId): Promise<AppLockGateState> {
    const stored = await findStoredConfig(userId)
    if (!stored?.enabled) {
      return {
        enabled: false,
        method: null,
        idleMinutes: DEFAULT_APP_LOCK_IDLE_MINUTES,
        unlocked: true,
      }
    }
    return {
      enabled: true,
      method: stored.method,
      idleMinutes: stored.idleMinutes,
      unlocked: await isAppUnlocked(userId),
    }
  },

  async save(input: z.output<typeof appLockConfigSchema>): Promise<AppLockSettings> {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    const existing = await findStoredConfig(session.user.id)
    const secret = normalizeSecret(input.method, input.secret)
    const salt = crypto.randomBytes(16).toString('hex')
    const value: AppLockStored = {
      enabled: true,
      method: input.method,
      hash: hashSecret(secret, salt),
      salt,
      idleMinutes: existing?.idleMinutes ?? DEFAULT_APP_LOCK_IDLE_MINUTES,
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
    return { enabled: true, method: input.method, idleMinutes: value.idleMinutes }
  },

  /** 只更新自动锁定时间，不要求重新设置解锁密码 */
  async updateIdle(input: z.output<typeof appLockIdleSchema>): Promise<AppLockSettings> {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    const stored = await findStoredConfig(session.user.id)
    if (!stored?.enabled) throw new Error('应用锁未开启')

    const value: AppLockStored = { ...stored, idleMinutes: input.idleMinutes }
    await db
      .update(schema.userConfigs)
      .set({ value, updatedAt: new Date() })
      .where(
        and(
          eq(schema.userConfigs.userId, session.user.id),
          eq(schema.userConfigs.key, APP_LOCK_KEY)
        )
      )

    return { enabled: true, method: stored.method, idleMinutes: input.idleMinutes }
  },

  async disable(input: z.output<typeof appLockDisableSchema> = {}): Promise<AppLockSettings> {
    const session = await auth()
    if (!session?.user.id) throw new Error('请先登录')

    const stored = await findStoredConfig(session.user.id)
    if (stored?.enabled) {
      if (input.password) {
        if (!session.user.email) {
          throw new Error('当前账号未设置密码，无法通过账号密码关闭应用锁')
        }
        await CredentialsController.verify({
          email: session.user.email,
          password: input.password,
        })
      } else if (input.secret) {
        if (!verifySecret(input.secret, stored)) {
          throw new Error('应用锁密码错误，请重试')
        }
      } else {
        throw new Error('请输入应用锁密码或账号密码')
      }
    }

    await db
      .delete(schema.userConfigs)
      .where(
        and(
          eq(schema.userConfigs.userId, session.user.id),
          eq(schema.userConfigs.key, APP_LOCK_KEY)
        )
      )
    await clearAppUnlockCookie()
    return { enabled: false, method: null, idleMinutes: DEFAULT_APP_LOCK_IDLE_MINUTES }
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
    return { enabled: false, method: null, idleMinutes: DEFAULT_APP_LOCK_IDLE_MINUTES }
  },

  /** 立即上锁：清除当前浏览器的解锁凭据 */
  async lock() {
    await clearAppUnlockCookie()
    return { locked: true }
  },
}

export default AppLockController
