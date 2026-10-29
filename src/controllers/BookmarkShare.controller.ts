import { db, schema } from '@/db'
import { getAuthedUserId } from '@/lib/auth'
import {
  BOOKMARK_SHARE_TTL,
  BookmarkSharePreview,
  createBookmarkShareCode,
  normalizeBookmarkShareCode,
} from '@/lib/share-code'
import { z } from '@/lib/zod'
import { and, eq, inArray, like } from 'drizzle-orm'

const SHARE_KEY_PREFIX = 'bookmark.share.'
const SHARE_CODE_RETRY = 5

const shareRecordSchema = z.object({
  bookmarkId: z.number().int().positive(),
  expiresAt: z.number(),
})

type ShareRecord = z.output<typeof shareRecordSchema>

export const bookmarkShareCodeSchema = z.object({
  code: z.string().trim().min(1, '请输入分享口令'),
})

function toShareKey(code: string) {
  return SHARE_KEY_PREFIX + code
}

function parseShareRecord(value: unknown): ShareRecord | null {
  const result = shareRecordSchema.safeParse(value)
  return result.success ? result.data : null
}

async function getBookmarkPreview(userId: UserId, bookmarkId: BookmarkId) {
  const bookmark = await db.query.userBookmarks.findFirst({
    where: and(eq(schema.userBookmarks.id, bookmarkId), eq(schema.userBookmarks.userId, userId)),
    with: { relatedTagIds: true },
  })
  if (!bookmark) return null

  const tags = bookmark.relatedTagIds.length
    ? await db.query.userTags.findMany({
        where: inArray(
          schema.userTags.id,
          bookmark.relatedTagIds.map((item) => item.tId)
        ),
        columns: { name: true, icon: true, color: true },
      })
    : []

  const preview: BookmarkSharePreview = {
    name: bookmark.name,
    url: bookmark.url,
    icon: bookmark.icon || '',
    description: bookmark.description || '',
    tags: tags.map((tag) => ({
      name: tag.name,
      icon: tag.icon || null,
      color: tag.color || null,
    })),
  }
  return preview
}

async function findActiveShare(userId: UserId, bookmarkId: BookmarkId) {
  const rows = await db.query.userConfigs.findMany({
    where: and(
      eq(schema.userConfigs.userId, userId),
      like(schema.userConfigs.key, `${SHARE_KEY_PREFIX}%`)
    ),
  })

  for (const row of rows) {
    const record = parseShareRecord(row.value)
    if (!record) continue
    if (record.expiresAt <= Date.now()) {
      await db.delete(schema.userConfigs).where(eq(schema.userConfigs.id, row.id))
      continue
    }
    if (record.bookmarkId === bookmarkId) {
      return {
        code: row.key.slice(SHARE_KEY_PREFIX.length),
        expiresAt: record.expiresAt,
      }
    }
  }
  return null
}

async function createUniqueCode() {
  for (let index = 0; index < SHARE_CODE_RETRY; index++) {
    const code = createBookmarkShareCode()
    const exists = await db.query.userConfigs.findFirst({
      where: eq(schema.userConfigs.key, toShareKey(code)),
      columns: { id: true },
    })
    if (!exists) return code
  }
  throw new Error('生成分享口令失败，请重试')
}

const BookmarkShareController = {
  /** 为当前用户自己的书签生成分享口令；同一书签复用未过期的口令 */
  async create(input: { id: BookmarkId }) {
    const userId = await getAuthedUserId()
    const preview = await getBookmarkPreview(userId, input.id)
    if (!preview) throw new Error('书签不存在')

    const activeShare = await findActiveShare(userId, input.id)
    if (activeShare) {
      return {
        code: activeShare.code,
        expiresAt: new Date(activeShare.expiresAt),
        bookmark: preview,
      }
    }

    const code = await createUniqueCode()
    const expiresAt = Date.now() + BOOKMARK_SHARE_TTL
    await db.insert(schema.userConfigs).values({
      userId,
      key: toShareKey(code),
      value: { bookmarkId: input.id, expiresAt },
      description: '书签分享口令',
      updatedAt: new Date(),
    })

    return {
      code,
      expiresAt: new Date(expiresAt),
      bookmark: preview,
    }
  },

  /** 解析他人分享的口令，返回可填入表单的书签信息 */
  async resolve(input: z.output<typeof bookmarkShareCodeSchema>) {
    // 只有登录用户才能接收分享
    await getAuthedUserId()

    const code = normalizeBookmarkShareCode(input.code)
    if (!code) throw new Error('口令无效或已过期')

    const row = await db.query.userConfigs.findFirst({
      where: eq(schema.userConfigs.key, toShareKey(code)),
    })
    const record = row ? parseShareRecord(row.value) : null
    if (!row || !record || record.expiresAt <= Date.now()) {
      if (row) {
        await db.delete(schema.userConfigs).where(eq(schema.userConfigs.id, row.id))
      }
      throw new Error('口令无效或已过期')
    }

    const preview = await getBookmarkPreview(row.userId, record.bookmarkId)
    if (!preview) {
      await db.delete(schema.userConfigs).where(eq(schema.userConfigs.id, row.id))
      throw new Error('口令对应的书签不存在或已被删除')
    }

    const owner = await db.query.users.findFirst({
      where: eq(schema.users.id, row.userId),
      columns: { name: true },
    })

    return {
      ...preview,
      tagNames: preview.tags.map((tag) => tag.name),
      sourceUserName: owner?.name || '',
    }
  },
}

export default BookmarkShareController
