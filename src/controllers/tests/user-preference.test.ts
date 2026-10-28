import { db, schema } from '@/db'
import UserPreferenceController from '@/controllers/UserPreference.controller'
import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

const currentUser = vi.hoisted(() => ({ id: '' }))

vi.mock('@/lib/auth', () => ({
  getAuthedUserId: async () => currentUser.id,
}))

const { users, userConfigs } = schema

describe('UserPreferenceController', () => {
  const suffix = faker.string.alphanumeric(8)
  let userId = ''

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: `preference-user-${suffix}`,
        email: `preference-${suffix}@example.com`,
        role: 'user',
      })
      .returning()
    userId = user.id
    currentUser.id = userId
  })

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId))
  })

  test('没有保存过偏好时默认使用原列表', async () => {
    await expect(UserPreferenceController.get()).resolves.toEqual({
      mobileBookmarkLayout: 'list',
    })
  })

  test('保存后按用户读取最新布局', async () => {
    await UserPreferenceController.update({ mobileBookmarkLayout: 'three-columns' })
    await expect(UserPreferenceController.get()).resolves.toEqual({
      mobileBookmarkLayout: 'three-columns',
    })

    const row = await db.query.userConfigs.findFirst({
      where: eq(userConfigs.userId, userId),
    })
    expect(row?.key).toBe('user.preferences')
  })
})
