import AppLockController, { appLockIdleSchema } from '@/controllers/AppLock.controller'
import { db, schema } from '@/db'
import { faker } from '@faker-js/faker'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

const currentUser = vi.hoisted(() => ({ id: '', email: '' }))
const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: currentUser.id, email: currentUser.email } }),
  getAuthedUserId: async () => currentUser.id,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
    set: (options: { name: string; value: string }) => cookieJar.set(options.name, options.value),
    delete: (name: string) => cookieJar.delete(name),
  }),
  headers: async () => new Headers(),
}))

const { users, userConfigs, credentials } = schema

describe('AppLockController', () => {
  const suffix = faker.string.alphanumeric(8)
  let userId = ''

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: `app-lock-${suffix}`,
        email: `app-lock-${suffix}@example.com`,
        role: 'user',
      })
      .returning()
    userId = user.id
    currentUser.id = userId
    currentUser.email = user.email

    const salt = 'app-lock-test-salt'
    const hash = crypto.pbkdf2Sync('locktest123', salt, 1000, 32, 'sha256').toString('hex')
    await db.insert(credentials).values({ userId, password: hash, salt })
  })

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId))
  })

  test('自动锁定时间只接受 1/5/10/30 分钟', () => {
    for (const idleMinutes of [1, 5, 10, 30]) {
      expect(appLockIdleSchema.safeParse({ idleMinutes }).success).toBe(true)
    }
    expect(appLockIdleSchema.safeParse({ idleMinutes: 2 }).success).toBe(false)
  })

  test('默认未开启应用锁', async () => {
    await expect(AppLockController.getSettings()).resolves.toEqual({
      enabled: false,
      method: null,
      idleMinutes: 30,
    })
  })

  test('开启数字应用锁后仍保持当前会话解锁', async () => {
    await expect(AppLockController.save({ method: 'pin', secret: '1234' })).resolves.toEqual({
      enabled: true,
      method: 'pin',
      idleMinutes: 30,
    })

    await expect(AppLockController.getGateState(userId)).resolves.toEqual({
      enabled: true,
      method: 'pin',
      idleMinutes: 30,
      unlocked: true,
    })

    const row = await db.query.userConfigs.findFirst({
      where: eq(userConfigs.userId, userId),
    })
    expect(row?.key).toBe('user.appLock')
    expect(JSON.stringify(row?.value)).not.toContain('1234')
  })

  test('自动锁定时间可单独更新，修改解锁方式时保留设置', async () => {
    await expect(AppLockController.updateIdle({ idleMinutes: 5 })).resolves.toEqual({
      enabled: true,
      method: 'pin',
      idleMinutes: 5,
    })
    await expect(AppLockController.getGateState(userId)).resolves.toMatchObject({
      enabled: true,
      idleMinutes: 5,
    })

    await AppLockController.save({ method: 'pin', secret: '1234' })
    await expect(AppLockController.getSettings()).resolves.toEqual({
      enabled: true,
      method: 'pin',
      idleMinutes: 5,
    })
  })

  test('错误的解锁密码会被拒绝，正确密码可以解锁', async () => {
    await expect(AppLockController.verify({ secret: '0000' })).rejects.toThrow('解锁密码错误')

    await AppLockController.lock()
    await expect(AppLockController.getGateState(userId)).resolves.toMatchObject({
      enabled: true,
      unlocked: false,
    })

    await expect(AppLockController.verify({ secret: '1234' })).resolves.toEqual({
      verified: true,
    })
    await expect(AppLockController.getGateState(userId)).resolves.toMatchObject({
      enabled: true,
      unlocked: true,
    })
  })

  test('九宫格少于 4 个点无法保存', async () => {
    await expect(AppLockController.save({ method: 'pattern', secret: '0,1,2' })).rejects.toThrow(
      '请至少连接 4 个不重复的点'
    )
  })

  test('关闭应用锁必须验证应用锁密码或账号密码', async () => {
    await expect(AppLockController.disable({})).rejects.toThrow('请输入应用锁密码或账号密码')
    await expect(AppLockController.disable({ secret: '0000' })).rejects.toThrow('应用锁密码错误')
    await expect(AppLockController.getSettings()).resolves.toMatchObject({ enabled: true })

    await expect(AppLockController.disable({ secret: '1234' })).resolves.toEqual({
      enabled: false,
      method: null,
      idleMinutes: 30,
    })
    await expect(AppLockController.getSettings()).resolves.toEqual({
      enabled: false,
      method: null,
      idleMinutes: 30,
    })
  })

  test('可以使用账号密码关闭应用锁', async () => {
    await AppLockController.save({ method: 'pin', secret: '1234' })
    await expect(AppLockController.disable({ password: 'wrong123' })).rejects.toThrow(
      '邮箱或密码错误'
    )
    await expect(AppLockController.disable({ password: 'locktest123' })).resolves.toEqual({
      enabled: false,
      method: null,
      idleMinutes: 30,
    })
  })

  test('应用锁关闭时不能更新自动锁定时间', async () => {
    await expect(AppLockController.updateIdle({ idleMinutes: 1 })).rejects.toThrow('应用锁未开启')
  })
})
