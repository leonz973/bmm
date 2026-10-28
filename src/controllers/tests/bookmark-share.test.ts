import BookmarkShareController from '@/controllers/BookmarkShare.controller'
import { db, schema } from '@/db'
import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

const currentUser = vi.hoisted(() => ({ id: '' }))

vi.mock('@/lib/auth', () => ({
  getAuthedUserId: async () => currentUser.id,
  auth: async () => ({ user: { id: currentUser.id } }),
}))

const { users, userTags, userBookmarks, userBookmarkToTag } = schema

describe('BookmarkShareController', () => {
  const suffix = faker.string.alphanumeric(8)
  let ownerId = ''
  let receiverId = ''
  let bookmarkId = 0
  let code = ''

  beforeAll(async () => {
    const [owner, receiver] = await db
      .insert(users)
      .values([
        { name: `share-owner-${suffix}`, email: `share-owner-${suffix}@example.com`, role: 'user' },
        {
          name: `share-receiver-${suffix}`,
          email: `share-receiver-${suffix}@example.com`,
          role: 'user',
        },
      ])
      .returning()
    ownerId = owner.id
    receiverId = receiver.id

    const [tag] = await db
      .insert(userTags)
      .values({ name: `share-tag-${suffix}`, userId: ownerId })
      .returning()
    const [bookmark] = await db
      .insert(userBookmarks)
      .values({
        name: `分享书签-${suffix}`,
        url: `https://example.com/${suffix}`,
        icon: 'https://example.com/icon.png',
        description: '分享口令测试',
        userId: ownerId,
      })
      .returning()
    bookmarkId = bookmark.id
    await db.insert(userBookmarkToTag).values({ bId: bookmarkId, tId: tag.id })
  })

  afterAll(async () => {
    if (ownerId) await db.delete(users).where(eq(users.id, ownerId))
    if (receiverId) await db.delete(users).where(eq(users.id, receiverId))
  })

  test('书签所有者可以生成分享口令', async () => {
    currentUser.id = ownerId
    const result = await BookmarkShareController.create({ id: bookmarkId })
    expect(result.code.startsWith('BMM1.')).toBe(true)
    code = result.code
  })

  test('其他用户可以通过口令读取书签信息', async () => {
    currentUser.id = receiverId
    await expect(BookmarkShareController.resolve({ code })).resolves.toEqual({
      name: `分享书签-${suffix}`,
      url: `https://example.com/${suffix}`,
      icon: 'https://example.com/icon.png',
      description: '分享口令测试',
      tagNames: [`share-tag-${suffix}`],
      sourceUserName: `share-owner-${suffix}`,
    })
  })

  test('被篡改的口令无效', async () => {
    currentUser.id = receiverId
    await expect(
      BookmarkShareController.resolve({ code: code.slice(0, -1) + 'x' })
    ).rejects.toThrow('口令无效或已过期')
  })

  test('不能为不存在的书签生成口令', async () => {
    currentUser.id = ownerId
    await expect(BookmarkShareController.create({ id: bookmarkId + 999999 })).rejects.toThrow(
      '书签不存在'
    )
  })
})
