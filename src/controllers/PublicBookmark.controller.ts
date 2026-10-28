import { db, schema } from '@/db'
import { z } from '@/lib/zod'
import { getPinyin } from '@/utils'
import { DEFAULT_BOOKMARK_PAGESIZE } from '@cfg'
import { and, asc, count, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm'
import BookmarkHostCheckController, {
  BookmarkHostCheckSummary,
  createBookmarkHostCheckFilter,
  getBookmarkHostKey,
  withBookmarkHostCheckSummaries,
} from './BookmarkHostCheck.controller'
import { createBookmarkFilterByKeyword } from './common'
import PublicTagController from './PublicTag.controller'
import { findManyBookmarksSchema } from './schemas'

const { publicBookmarkToTag, publicBookmarks, userBookmarks } = schema

interface TagIdsExt {
  relatedTagIds: TagId[]
}
export type InsertPublicBookmark = Partial<TagIdsExt> & typeof publicBookmarks.$inferInsert
type SelectBookmark = BookmarkHostCheckSummary &
  TagIdsExt & { sourceUserName?: string | null } &
  Omit<typeof publicBookmarks.$inferSelect, 'sourceUserBookmarkId'>
export type { SelectBookmark as SelectPublicBookmark }

type BookmarkWithSource = typeof publicBookmarks.$inferSelect & {
  relatedTagIds: { tId: TagId }[]
  sourceUserBookmark?: { user?: { name: string | null } | null } | null
}

function toSelectBookmark(item: BookmarkWithSource): SelectBookmark {
  const { sourceUserBookmark, ...rest } = item
  return {
    ...rest,
    sourceUserName: sourceUserBookmark?.user?.name ?? null,
    relatedTagIds: item.relatedTagIds.map((el) => el.tId),
  }
}

/**
 * 完全更新 PublicBookmarkToTag 表，使与 bId 关联关联的 tId 全是 tagIds 中的 id
 */
export async function fullSetBookmarkToTag(bId: BookmarkId, tagIds: TagId[]) {
  const task = [
    db
      .insert(publicBookmarkToTag)
      .values(tagIds.map((tId) => ({ bId: bId, tId })))
      .onConflictDoNothing(),
    db
      .delete(publicBookmarkToTag)
      .where(and(eq(publicBookmarkToTag.bId, bId), notInArray(publicBookmarkToTag.tId, tagIds))),
  ]
  await Promise.all(task)
  return
}

async function createFindManyFilters(query: z.output<typeof findManyBookmarksSchema>) {
  const { keyword, tagIds = [], tagNames, hostCheckStatus, ids } = query
  const filters = []
  if (ids?.length) {
    filters.push(inArray(publicBookmarks.id, ids))
  }
  if (keyword) {
    filters.push(createBookmarkFilterByKeyword(publicBookmarks, keyword))
  }
  if (tagNames?.length) {
    const tags = await PublicTagController.getAll()
    for (const name of tagNames) {
      const tag = tags.find((el) => el.name === name)
      tag && tagIds.push(tag.id)
    }
  }
  if (tagIds.length) {
    const findTargetBIds = db
      .select({ bId: publicBookmarkToTag.bId })
      .from(publicBookmarkToTag)
      .where(inArray(publicBookmarkToTag.tId, tagIds))
      .groupBy(publicBookmarkToTag.bId)
      .having(sql`COUNT(DISTINCT ${publicBookmarkToTag.tId}) = ${tagIds.length}`)
    filters.push(inArray(publicBookmarks.id, findTargetBIds))
  }
  const hostCheckFilter = hostCheckStatus ? createBookmarkHostCheckFilter(publicBookmarks, hostCheckStatus) : undefined
  if (hostCheckFilter) {
    filters.push(hostCheckFilter)
  }
  return filters.length ? and(...filters) : undefined
}

async function resetSourcePublishStatus(publicBookmarkIds: BookmarkId[]) {
  if (!publicBookmarkIds.length) return
  const rows = await db
    .select({ sourceUserBookmarkId: publicBookmarks.sourceUserBookmarkId })
    .from(publicBookmarks)
    .where(inArray(publicBookmarks.id, publicBookmarkIds))
  const sourceIds = rows
    .map((row) => row.sourceUserBookmarkId)
    .filter((id): id is number => id !== null)
  if (!sourceIds.length) return
  await db
    .update(userBookmarks)
    .set({
      publishStatus: 'private',
      publishRequestedAt: null,
      publishedAt: null,
      publishRejectReason: null,
    })
    .where(inArray(userBookmarks.id, sourceIds))
}

const PublicBookmarkController = {
  async insert(bookmark: InsertPublicBookmark) {
    const { relatedTagIds, ...resetBookmark } = bookmark
    // 插入之前先检查当前用户是否有相同网址或名称的记录
    const count = await db.$count(
      publicBookmarks,
      or(eq(publicBookmarks.url, resetBookmark.url), eq(publicBookmarks.name, resetBookmark.name))
    )
    if (count > 0) throw new Error('书签已存在')
    resetBookmark.pinyin ||= getPinyin(resetBookmark.name)
    resetBookmark.hostKey = getBookmarkHostKey(resetBookmark.url)
    const rows = await db.insert(publicBookmarks).values(resetBookmark).returning()
    const id = rows[0].id
    if (relatedTagIds?.length) {
      await fullSetBookmarkToTag(id, relatedTagIds)
    }
    return rows[0]
  },
  async query(bookmark: Pick<SelectBookmark, 'id'>) {
    const res = await db.query.publicBookmarks.findFirst({
      where: eq(publicBookmarks.id, bookmark.id),
      with: { relatedTagIds: true },
    })
    if (!res) throw new Error('书签不存在')
    return {
      ...res,
      relatedTagIds: res.relatedTagIds.map((el) => el.tId),
    }
  },
  async update(bookmark: Partial<SelectBookmark> & Pick<SelectBookmark, 'id'>) {
    const {
      relatedTagIds,
      id,
      hostCheckStatus,
      hostCheckedAt,
      hostCheckHttpStatus,
      hostCheckErrorMessage,
      ...resetBookmark
    } = bookmark
    const tasks = []
    if (relatedTagIds?.length) {
      tasks.push(fullSetBookmarkToTag(id, relatedTagIds))
    }
    if (Object.keys(resetBookmark).length) {
      if (resetBookmark.url) {
        resetBookmark.hostKey = getBookmarkHostKey(resetBookmark.url)
      }
      tasks.push(
        db
          .update(publicBookmarks)
          .set({
            ...resetBookmark,
            updatedAt: new Date(),
            pinyin: resetBookmark.name ? getPinyin(resetBookmark.name) : undefined,
          })
          .where(eq(publicBookmarks.id, id))
          .returning()
          .then((res) => res[0])
      )
    }
    const res = await Promise.all(tasks)
    return res.pop()
  },
  async delete(bookmark: Pick<SelectBookmark, 'id'>) {
    await resetSourcePublishStatus([bookmark.id])
    const res = await db
      .delete(publicBookmarks)
      .where(eq(publicBookmarks.id, bookmark.id))
      .returning()
    return res
  },
  async removeMany({ ids }: { ids: BookmarkId[] }) {
    await resetSourcePublishStatus(ids)
    const res = await db
      .delete(publicBookmarks)
      .where(inArray(publicBookmarks.id, ids))
      .returning()
    return res
  },
  /**
   * 高级搜索书签列表
   */
  async findMany(query?: z.output<typeof findManyBookmarksSchema>) {
    query ||= findManyBookmarksSchema.parse({})
    const { page, limit, sorterKey } = query
    const filters = await createFindManyFilters(query)
    const [list, [{ total }]] = await Promise.all([
      await db.query.publicBookmarks.findMany({
        where: filters,
        with: {
          relatedTagIds: true,
          sourceUserBookmark: { with: { user: { columns: { name: true } } } },
        },
        limit,
        offset: (page - 1) * limit,
        orderBy: (() => {
          const sort = sorterKey.startsWith('-') ? desc : asc
          const field = sorterKey.includes('update')
            ? publicBookmarks.updatedAt
            : sorterKey.includes('create')
              ? publicBookmarks.createdAt
              : null

          return field ? sort(field) : undefined
        })(),
      }),
      db.select({ total: count() }).from(publicBookmarks).where(filters),
    ])

    const listWithTags = list.map(toSelectBookmark)
    const resultList: SelectBookmark[] = query.includeHostCheckSummary
      ? await withBookmarkHostCheckSummaries(listWithTags)
      : listWithTags

    return {
      total,
      hasMore: total > page * limit,
      list: resultList,
    }
  },
  async checkHost(bookmark: Pick<SelectBookmark, 'id'>) {
    const row = await db.query.publicBookmarks.findFirst({
      where: eq(publicBookmarks.id, bookmark.id),
    })
    if (!row) throw new Error('书签不存在')
    if (!row.hostKey) throw new Error('当前书签无法解析出可检测的网站 Host')
    return await BookmarkHostCheckController.checkHost(row.hostKey)
  },
  async batchCheckHosts(query?: z.input<typeof findManyBookmarksSchema>) {
    const parsedQuery = query ? findManyBookmarksSchema.parse(query) : findManyBookmarksSchema.parse({})
    const filters = await createFindManyFilters(parsedQuery)
    const rows = await db
      .select({ hostKey: publicBookmarks.hostKey })
      .from(publicBookmarks)
      .where(filters)
    return await BookmarkHostCheckController.checkHosts(rows.map((item) => item.hostKey))
  },
  async startCheckHostsTask() {
    return await BookmarkHostCheckController.startPublicCheckHostsTask()
  },
  async getCheckHostsTask() {
    return await BookmarkHostCheckController.getPublicCheckHostsTask()
  },
  async random() {
    const list = await db.query.publicBookmarks.findMany({
      with: {
        relatedTagIds: true,
        sourceUserBookmark: { with: { user: { columns: { name: true } } } },
      },
      orderBy: sql`RANDOM()`,
      limit: DEFAULT_BOOKMARK_PAGESIZE,
    })
    return {
      list: list.map(toSelectBookmark),
    }
  },
  /** 获取所有书签数量 */
  async total() {
    return await db.$count(publicBookmarks)
  },
  /** 获取最近更新的 $DEFAULT_BOOKMARK_PAGESIZE 个书签 */
  async recent() {
    const res = await db.query.publicBookmarks.findMany({
      orderBy(fields, op) {
        return op.desc(fields.updatedAt)
      },
      with: {
        relatedTagIds: true,
        sourceUserBookmark: { with: { user: { columns: { name: true } } } },
      },
      limit: DEFAULT_BOOKMARK_PAGESIZE,
    })
    return {
      list: res.map(toSelectBookmark),
    }
  },
  /** 根据关键词搜索书签 */
  async search(keyword: string) {
    const res = await db.query.publicBookmarks.findMany({
      where: createBookmarkFilterByKeyword(publicBookmarks, keyword),
      with: {
        relatedTagIds: true,
        sourceUserBookmark: { with: { user: { columns: { name: true } } } },
      },
      limit: 100,
    })
    return {
      list: res.map(toSelectBookmark),
    }
  },
}

export default PublicBookmarkController
