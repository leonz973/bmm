import crypto from 'crypto'

/**
 * 使用 AUTH_SECRET 对 JSON 载荷做 HMAC 签名。
 * 用于无需服务端存储的一次性凭据（应用锁 Cookie、书签分享口令）。
 */
function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('缺少 AUTH_SECRET，无法生成校验凭据')
  }
  return secret
}

function sign(body: string) {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
}

export function createSignedToken(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readSignedToken<T>(token: string): T | null {
  const trimmed = token.trim()
  const separator = trimmed.lastIndexOf('.')
  if (separator <= 0) return null

  const body = trimmed.slice(0, separator)
  const signature = trimmed.slice(separator + 1)
  const expected = sign(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
