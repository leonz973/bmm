import { createSignedToken, readSignedToken } from './signed-token'

const SHARE_CODE_PREFIX = 'BMM1'
const SHARE_CODE_TTL = 7 * 24 * 60 * 60 * 1000

interface BookmarkShareToken {
  type: 'bookmark-share'
  bookmarkId: number
  userId: string
  expiresAt: number
}

export const BOOKMARK_SHARE_TTL = SHARE_CODE_TTL

export function createBookmarkShareCode(input: { bookmarkId: number; userId: string }) {
  const token = createSignedToken({
    type: 'bookmark-share',
    bookmarkId: input.bookmarkId,
    userId: input.userId,
    expiresAt: Date.now() + SHARE_CODE_TTL,
  } satisfies BookmarkShareToken)

  return `${SHARE_CODE_PREFIX}.${token}`
}

export function readBookmarkShareCode(code: string) {
  // 复制口令时可能带上空格或换行，统一清理后再解析
  const normalized = code.replace(/\s+/g, '')
  if (!normalized.startsWith(`${SHARE_CODE_PREFIX}.`)) return null

  const token = readSignedToken<BookmarkShareToken>(normalized.slice(SHARE_CODE_PREFIX.length + 1))
  if (
    !token ||
    token.type !== 'bookmark-share' ||
    !Number.isInteger(token.bookmarkId) ||
    typeof token.userId !== 'string' ||
    typeof token.expiresAt !== 'number' ||
    token.expiresAt < Date.now()
  ) {
    return null
  }

  return { bookmarkId: token.bookmarkId, userId: token.userId }
}
