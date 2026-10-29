import { customAlphabet } from 'nanoid'

export const BOOKMARK_SHARE_CODE_PREFIX = 'BMM-'
export const BOOKMARK_SHARE_TTL = 7 * 24 * 60 * 60 * 1000

/** 去掉易混淆的 I/O/0/1，口令长度 8 位，配合 BMM- 前缀共 12 个字符 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const generateCode = customAlphabet(CODE_ALPHABET, 8)
const CODE_PATTERN = /BMM[\s-]*([2-9A-HJ-NP-Z]{8})/

export interface BookmarkShareTag {
  name: string
  icon: string | null
  color: string | null
}

export interface BookmarkSharePreview {
  name: string
  url: string
  icon: string
  description: string
  tags: BookmarkShareTag[]
}

export function createBookmarkShareCode() {
  return `${BOOKMARK_SHARE_CODE_PREFIX}${generateCode()}`
}

/**
 * 从任意文本中提取分享口令，自动忽略前后说明、空格、换行等字符。
 * 同时兼容不带 BMM- 前缀的 8 位口令。
 */
export function normalizeBookmarkShareCode(input: string) {
  const normalized = input.normalize('NFKC').toUpperCase()
  const matched = normalized.match(CODE_PATTERN)
  if (matched) return `${BOOKMARK_SHARE_CODE_PREFIX}${matched[1]}`

  const bare = normalized.trim()
  if (/^[2-9A-HJ-NP-Z]{8}$/.test(bare)) {
    return `${BOOKMARK_SHARE_CODE_PREFIX}${bare}`
  }
  return null
}
