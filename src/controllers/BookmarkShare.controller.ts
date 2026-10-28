import { db, schema } from '@/db'
import { getAuthedUserId } from '@/lib/auth'
import {
  BOOKMARK_SHARE_TTL,
  createBookmarkShareCode,
  readBookmarkShareCode,
} from '@/lib/share-code'
import { z } from '@/lib/zod'
import { and, eq, inArray } from 'drizzle-orm'

export const bookmarkShareCodeSchema = z.object({
  code: z.string().trim().min(1, '请输入分享口令'),
})

const BookmarkShareController = {
  /** 为当前用户自己的书签生成分享口令 */
  async create(input: { id: BookmarkId }) {
    const userId = await getAuthedUserId()
    const bookmark = await db.query.userBookmarks.findFirst({
      where: and(eq(schema.userBookmarks.id, input.id), eq(schema.userBookmarks.userId, userId)),
      columns: { id: true },
    })
    if (!bookmark) throw new Error('书签不存在')

    return {
      code: createBookmarkShareCode({ bookmarkId: bookmark.id, userId }),
      expiresAt: new Date(Date.now() + BOOKMARK_SHARE_TTL),
    }
  },

  /** 解析他人分享的口令，返回可填入表单的书签信息 */
  async resolve(input: z.output<typeof bookmarkShareCodeSchema>) {
    // 只有登录用户才能接收分享
    await getAuthedUserId()

    const payload = readBookmarkShareCode(input.code)
    if (!payload) throw new Error('口令无效或已过期')

    const bookmark = await db.query.userBookmarks.findFirst({
      where: and(
        eq(schema.userBookmarks.id, payload.bookmarkId),
        eq(schema.userBookmarks.userId, payload.userId)
      ),
      with: { relatedTagIds: true },
    })
    if (!bookmark) throw new Error('口令对应的书签不存在或已被删除')

    const [owner, tags] = await Promise.all([
      db.query.users.findFirst({
        where: eq(schema.users.id, payload.userId),
        columns: { name: true },
      }),
      bookmark.relatedTagIds.length
        ? db.query.userTags.findMany({
            where: inArray(
              schema.userTags.id,
              bookmark.relatedTagIds.map((item) => item.tId)
            ),
            columns: { name: true },
          })
        : Promise.resolve([]),
    ])

    return {
      name: bookmark.name,
      url: bookmark.url,
      icon: bookmark.icon || '',
      description: bookmark.description || '',
      tagNames: tags.map((tag) => tag.name),
      sourceUserName: owner?.name || '',
    }
  },
}

export default BookmarkShareController
