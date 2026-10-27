import { db, schema } from '@/db'
import { z } from '@/lib/zod'
import { getPinyin } from '@/utils'
import { and, desc, eq, inArray, ne, notInArray, or } from 'drizzle-orm'
import PublicTagController from './PublicTag.controller'

const { publicBookmarkToTag, publicBookmarks, userBookmarkToTag, userBookmarks, userTags } = schema

export const publishStatusSchema = z.enum(['private', 'pending', 'public', 'rejected'])
export type PublishStatus = z.output<typeof publishStatusSchema>

export const bookmarkPublishInputSchema = z.object({
  id: z.number().int().positive(),
})

export const reviewBookmarkPublishSchema = z.object({
  id: z.number().int().positive(),
  approve: z.boolean(),
  rejectReason: z.string().max(200).optional(),
})

export const findBookmarkPublishRequestsSchema = z.object({
  status: publishStatusSchema.default('pending'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

type UserBookmarkRow = typeof userBookmarks.$inferSelect

async function getActor() {
  const { auth } = await import('@/lib/auth')
  const session = await auth()
  if (!session?.user?.id) throw new Error('请先登录')
  return { userId: session.user.id, isAdmin: Boolean(session.user.isAdmin) }
}

async function getPublicCopyId(userBookmarkId: number) {
  const row = await db.query.publicBookmarks.findFirst({
    where: eq(publicBookmarks.sourceUserBookmarkId, userBookmarkId),
    columns: { id: true },
  })
  return row?.id ?? null
}

async function getTagNames(userBookmarkId: number) {
  const rows = await db
    .select({ name: userTags.name })
    .from(userBookmarkToTag)
    .innerJoin(userTags, eq(userTags.id, userBookmarkToTag.tId))
    .where(eq(userBookmarkToTag.bId, userBookmarkId))
  return rows.map((row) => row.name)
}

async function syncPublicTags(publicBookmarkId: number, names: string[]) {
  const tags = names.length ? await PublicTagController.tryCreateTags(names) : []
  const tagIds = tags.map((tag) => tag.id)
  if (tagIds.length) {
    await db
      .insert(publicBookmarkToTag)
      .values(tagIds.map((tId) => ({ bId: publicBookmarkId, tId })))
      .onConflictDoNothing()
    await db
      .delete(publicBookmarkToTag)
      .where(
        and(
          eq(publicBookmarkToTag.bId, publicBookmarkId),
          notInArray(publicBookmarkToTag.tId, tagIds)
        )
      )
  } else {
    await db.delete(publicBookmarkToTag).where(eq(publicBookmarkToTag.bId, publicBookmarkId))
  }
}

function toPublicPayload(bookmark: UserBookmarkRow) {
  return {
    name: bookmark.name,
    url: bookmark.url,
    icon: bookmark.icon,
    description: bookmark.description,
    pinyin: bookmark.pinyin || getPinyin(bookmark.name),
    hostKey: bookmark.hostKey,
    sourceUserBookmarkId: bookmark.id,
  }
}

async function publishBookmark(bookmarkId: number) {
  const bookmark = await db.query.userBookmarks.findFirst({
    where: eq(userBookmarks.id, bookmarkId),
  })
  if (!bookmark) throw new Error('书签不存在')

  const payload = toPublicPayload(bookmark)
  let publicId = await getPublicCopyId(bookmarkId)

  if (publicId) {
    await db
      .update(publicBookmarks)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(publicBookmarks.id, publicId))
  } else {
    const conflict = await db.query.publicBookmarks.findFirst({
      where: or(
        eq(publicBookmarks.name, bookmark.name),
        eq(publicBookmarks.url, bookmark.url)
      ),
      columns: { id: true },
    })
    if (conflict) throw new Error('公共书签中已存在同名或同网址的书签，无法公开')

    const rows = await db
      .insert(publicBookmarks)
      .values({ ...payload, isPinned: false })
      .returning({ id: publicBookmarks.id })
    publicId = rows[0].id
  }

  await syncPublicTags(publicId, await getTagNames(bookmarkId))
  await db
    .update(userBookmarks)
    .set({
      publishStatus: 'public',
      publishedAt: new Date(),
      publishRejectReason: null,
    })
    .where(eq(userBookmarks.id, bookmarkId))

  return { status: 'public' as const }
}

// 管理员直接公开；普通用户提交申请
async function request(input: z.output<typeof bookmarkPublishInputSchema>) {
  const actor = await getActor()
  const where = actor.isAdmin
    ? eq(userBookmarks.id, input.id)
    : and(eq(userBookmarks.id, input.id), eq(userBookmarks.userId, actor.userId))
  const bookmark = await db.query.userBookmarks.findFirst({ where })
  if (!bookmark) throw new Error('书签不存在')

  if (bookmark.publishStatus === 'public') throw new Error('该书签已经公开')
  if (bookmark.publishStatus === 'pending') throw new Error('该书签已提交公开申请，请等待管理员审核')
  if (actor.isAdmin) return await publishBookmark(bookmark.id)

  await db
    .update(userBookmarks)
    .set({
      publishStatus: 'pending',
      publishRequestedAt: new Date(),
      publishRejectReason: null,
    })
    .where(eq(userBookmarks.id, bookmark.id))

  return { status: 'pending' as const }
}

async function cancel(input: z.output<typeof bookmarkPublishInputSchema>) {
  const actor = await getActor()
  const rows = await db
    .update(userBookmarks)
    .set({
      publishStatus: 'private',
      publishRequestedAt: null,
      publishRejectReason: null,
    })
    .where(
      and(
        eq(userBookmarks.id, input.id),
        eq(userBookmarks.userId, actor.userId),
        eq(userBookmarks.publishStatus, 'pending')
      )
    )
    .returning({ id: userBookmarks.id })
  if (!rows.length) throw new Error('没有可撤回的公开申请')
  return { status: 'private' as const }
}

async function findMany(input?: z.input<typeof findBookmarkPublishRequestsSchema>) {
  const query = findBookmarkPublishRequestsSchema.parse(input || {})
  const where = eq(userBookmarks.publishStatus, query.status)
  const [total, list] = await Promise.all([
    db.$count(userBookmarks, where),
    db.query.userBookmarks.findMany({
      where,
      with: {
        relatedTagIds: true,
        user: { columns: { id: true, name: true, email: true } },
      },
      orderBy: desc(userBookmarks.publishRequestedAt),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    }),
  ])

  const bookmarkIds = list.map((item) => item.id)
  const tagRows = bookmarkIds.length
    ? await db
        .select({ bId: userBookmarkToTag.bId, name: userTags.name })
        .from(userBookmarkToTag)
        .innerJoin(userTags, eq(userTags.id, userBookmarkToTag.tId))
        .where(inArray(userBookmarkToTag.bId, bookmarkIds))
    : []
  const tagNameMap = new Map<number, string[]>()
  for (const row of tagRows) {
    tagNameMap.set(row.bId, [...(tagNameMap.get(row.bId) || []), row.name])
  }

  return {
    total,
    hasMore: total > query.page * query.limit,
    list: list.map(({ user, relatedTagIds, ...item }) => ({
      ...item,
      relatedTagIds: relatedTagIds.map((relation) => relation.tId),
      relatedTagNames: tagNameMap.get(item.id) || [],
      userName: user?.name || '未命名用户',
      userEmail: user?.email || '',
    })),
  }
}

async function review(input: z.output<typeof reviewBookmarkPublishSchema>) {
  const actor = await getActor()
  if (!actor.isAdmin) throw new Error('没有权限审核公开申请')

  const bookmark = await db.query.userBookmarks.findFirst({
    where: eq(userBookmarks.id, input.id),
  })
  if (!bookmark) throw new Error('书签不存在')
  if (bookmark.publishStatus !== 'pending') throw new Error('该申请已处理')

  if (input.approve) return await publishBookmark(bookmark.id)

  await db
    .update(userBookmarks)
    .set({
      publishStatus: 'rejected',
      publishRejectReason: input.rejectReason?.trim() || null,
    })
    .where(eq(userBookmarks.id, bookmark.id))

  return { status: 'rejected' as const }
}

// 在个人书签修改前检查公共副本是否会产生唯一键冲突
async function assertCanSync(
  bookmarkId: number,
  changes: Partial<Pick<UserBookmarkRow, 'name' | 'url'>>,
  userId?: string
) {
  const where = userId
    ? and(eq(userBookmarks.id, bookmarkId), eq(userBookmarks.userId, userId))
    : eq(userBookmarks.id, bookmarkId)
  const bookmark = await db.query.userBookmarks.findFirst({
    where,
    columns: { id: true, name: true, url: true, publishStatus: true },
  })
  if (!bookmark) throw new Error('书签不存在')
  if (bookmark.publishStatus !== 'public') return

  const publicId = await getPublicCopyId(bookmarkId)
  if (!publicId) return

  const conflict = await db.query.publicBookmarks.findFirst({
    where: and(
      ne(publicBookmarks.id, publicId),
      or(
        eq(publicBookmarks.name, changes.name ?? bookmark.name),
        eq(publicBookmarks.url, changes.url ?? bookmark.url)
      )
    ),
    columns: { id: true },
  })
  if (conflict) throw new Error('公共书签中已存在同名或同网址的书签，无法同步修改')
}

async function syncAfterUpdate(bookmarkId: number) {
  const bookmark = await db.query.userBookmarks.findFirst({
    where: eq(userBookmarks.id, bookmarkId),
  })
  if (!bookmark || bookmark.publishStatus !== 'public') return

  const publicId = await getPublicCopyId(bookmarkId)
  if (!publicId) {
    await db
      .update(userBookmarks)
      .set({
        publishStatus: 'private',
        publishRequestedAt: null,
        publishedAt: null,
        publishRejectReason: null,
      })
      .where(eq(userBookmarks.id, bookmarkId))
    return
  }

  await db
    .update(publicBookmarks)
    .set({ ...toPublicPayload(bookmark), updatedAt: new Date() })
    .where(eq(publicBookmarks.id, publicId))
  await syncPublicTags(publicId, await getTagNames(bookmarkId))
}

async function removePublicCopy(userBookmarkId: number, userId: string) {
  const bookmark = await db.query.userBookmarks.findFirst({
    where: and(eq(userBookmarks.id, userBookmarkId), eq(userBookmarks.userId, userId)),
    columns: { id: true },
  })
  if (!bookmark) return
  await db.delete(publicBookmarks).where(eq(publicBookmarks.sourceUserBookmarkId, userBookmarkId))
}

async function removePublicCopies(userBookmarkIds: number[], userId: string) {
  if (!userBookmarkIds.length) return
  const owned = await db
    .select({ id: userBookmarks.id })
    .from(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), inArray(userBookmarks.id, userBookmarkIds)))
  if (!owned.length) return
  await db
    .delete(publicBookmarks)
    .where(inArray(publicBookmarks.sourceUserBookmarkId, owned.map((item) => item.id)))
}

const BookmarkPublicationController = {
  request,
  cancel,
  findMany,
  review,
  publish: publishBookmark,
  assertCanSync,
  syncAfterUpdate,
  removePublicCopy,
  removePublicCopies,
}

export default BookmarkPublicationController
