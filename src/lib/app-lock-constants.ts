/** 应用锁解锁凭据 Cookie 名 */
export const APP_LOCK_COOKIE_NAME = 'bmm_app_lock'

/** 长时间无操作后自动重新上锁（30 分钟） */
export const APP_LOCK_IDLE_MS = 30 * 60 * 1000

/** 本地记录最近一次操作时间的 key，供多个标签页共享 */
export const APP_LOCK_ACTIVITY_KEY = 'bmm:app-lock:last-active'
