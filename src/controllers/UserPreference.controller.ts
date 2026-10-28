import { db, schema } from '@/db'
import { getAuthedUserId } from '@/lib/auth'
import { z } from '@/lib/zod'
import { and, eq } from 'drizzle-orm'

const PREFERENCES_KEY = 'user.preferences'

export const MOBILE_BOOKMARK_LAYOUTS = ['list', 'two-columns', 'three-columns'] as const

export type MobileBookmarkLayout = (typeof MOBILE_BOOKMARK_LAYOUTS)[number]

export const userPreferencesSchema = z.object({
  mobileBookmarkLayout: z.enum(MOBILE_BOOKMARK_LAYOUTS).default('list'),
})

export type UserPreferences = z.output<typeof userPreferencesSchema>

export const DEFAULT_USER_PREFERENCES: UserPreferences = { mobileBookmarkLayout: 'list' }

const UserPreferenceController = {
  async get(userId?: UserId): Promise<UserPreferences> {
    userId ||= await getAuthedUserId()
    const row = await db.query.userConfigs.findFirst({
      where: and(
        eq(schema.userConfigs.userId, userId),
        eq(schema.userConfigs.key, PREFERENCES_KEY)
      ),
    })
    const result = userPreferencesSchema.safeParse(row?.value)
    return result.success ? result.data : DEFAULT_USER_PREFERENCES
  },

  async update(input: UserPreferences): Promise<UserPreferences> {
    const userId = await getAuthedUserId()
    const value = userPreferencesSchema.parse(input)
    await db
      .insert(schema.userConfigs)
      .values({
        userId,
        key: PREFERENCES_KEY,
        value,
        description: '用户界面偏好',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.userConfigs.userId, schema.userConfigs.key],
        set: { value, updatedAt: new Date() },
      })
    return value
  },
}

export default UserPreferenceController
