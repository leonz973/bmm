import { db, schema } from '@/db'
import BookmarkPublicationController from '@/controllers/BookmarkPublication.controller'
import PublicBookmarkController from '@/controllers/PublicBookmark.controller'
import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const currentUser = vi.hoisted(() => ({
  id: '',
  isAdmin: false,
}))

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: currentUser.id, isAdmin: currentUser.isAdmin } }),
}))

const { publicBookmarks, publicTags, userBookmarkToTag, userBookmarks, userTags, users } = schema

describe('BookmarkPublicationController', () => {
  const suffix = faker.string.alphanumeric(8)
  const tagName = `publish-tag-${suffix}`
  let userId = ''
  let bookmarkId = 0
  let publicId = 0

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        name: `publish-user-${suffix}`,
        email: `publish-${suffix}@example.com`,
        role: 'user',
      })
      .returning()
    userId = user.id

    const [bookmark] = await db
      .insert(userBookmarks)
      .values({
        name: `publish-bookmark-${suffix}`,
        url: `https://example.com/${suffix}`,
        description: '公开申请测试',
        userId,
      })
      .returning()
    bookmarkId = bookmark.id

    const [tag] = await db
      .insert(userTags)
      .values({ name: tagName, userId })
      .returning()
    await db.insert(userBookmarkToTag).values({ bId: bookmarkId, tId: tag.id })
  })

  beforeEach(() => {
    currentUser.id = userId
    currentUser.isAdmin = false
  })

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId))
    await db.delete(publicTags).where(eq(publicTags.name, tagName))
  })

  test('普通用户提交公开申请后进入待审核状态', async () => {
    const result = await BookmarkPublicationController.request({ id: bookmarkId })
    expect(result.status).toBe('pending')

    const row = await db.query.userBookmarks.findFirst({
      where: eq(userBookmarks.id, bookmarkId),
    })
    expect(row?.publishStatus).toBe('pending')
    expect(row?.publishRequestedAt).toBeInstanceOf(Date)
  })

  test('管理员可以查询待审核申请', async () => {
    const result = await BookmarkPublicationController.findMany({ status: 'pending' })
    expect(result.list.some((item) => item.id === bookmarkId)).toBe(true)
    expect(result.list.find((item) => item.id === bookmarkId)?.userName).toBeTruthy()
  })

  test('管理员审核通过后生成公共书签并复制标签', async () => {
    currentUser.isAdmin = true
    const result = await BookmarkPublicationController.review({ id: bookmarkId, approve: true })
    expect(result.status).toBe('public')

    const publicRow = await db.query.publicBookmarks.findFirst({
      where: eq(publicBookmarks.sourceUserBookmarkId, bookmarkId),
      with: { relatedTagIds: true },
    })
    expect(publicRow?.name).toBe(`publish-bookmark-${suffix}`)
    expect(publicRow?.relatedTagIds.length).toBe(1)
    publicId = publicRow!.id

    const tag = await db.query.publicTags.findFirst({ where: eq(publicTags.name, tagName) })
    expect(tag).toBeTruthy()
  })

  test('个人书签修改后同步公共副本', async () => {
    const newName = `publish-renamed-${suffix}`
    await db.update(userBookmarks).set({ name: newName }).where(eq(userBookmarks.id, bookmarkId))
    await BookmarkPublicationController.syncAfterUpdate(bookmarkId)

    const publicRow = await db.query.publicBookmarks.findFirst({
      where: eq(publicBookmarks.id, publicId),
    })
    expect(publicRow?.name).toBe(newName)
  })

  test('管理员删除公共副本后个人书签回到私有状态', async () => {
    await PublicBookmarkController.delete({ id: publicId })
    const row = await db.query.userBookmarks.findFirst({
      where: eq(userBookmarks.id, bookmarkId),
    })
    expect(row?.publishStatus).toBe('private')
  })

  test('管理员拒绝申请后记录拒绝原因', async () => {
    await BookmarkPublicationController.request({ id: bookmarkId })
    currentUser.isAdmin = true
    const result = await BookmarkPublicationController.review({
      id: bookmarkId,
      approve: false,
      rejectReason: '内容不符合收录标准',
    })
    expect(result.status).toBe('rejected')

    const row = await db.query.userBookmarks.findFirst({
      where: eq(userBookmarks.id, bookmarkId),
    })
    expect(row?.publishStatus).toBe('rejected')
    expect(row?.publishRejectReason).toBe('内容不符合收录标准')
  })

  test('管理员可以直接公开个人书签', async () => {
    currentUser.isAdmin = true
    const result = await BookmarkPublicationController.request({ id: bookmarkId })
    expect(result.status).toBe('public')

    const publicRow = await db.query.publicBookmarks.findFirst({
      where: eq(publicBookmarks.sourceUserBookmarkId, bookmarkId),
    })
    expect(publicRow).toBeTruthy()
  })
})
