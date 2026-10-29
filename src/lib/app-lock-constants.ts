/** 应用锁解锁凭据 Cookie 名 */
export const APP_LOCK_COOKIE_NAME = 'bmm_app_lock'

/** 自动锁定时间可选项（分钟） */
export const APP_LOCK_IDLE_OPTIONS = [1, 5, 10, 30] as const
export type AppLockIdleMinutes = (typeof APP_LOCK_IDLE_OPTIONS)[number]

/** 默认自动锁定时间（分钟） */
export const DEFAULT_APP_LOCK_IDLE_MINUTES: AppLockIdleMinutes = 30

/** 本地记录最近一次操作时间的 key，供多个标签页共享 */
export const APP_LOCK_ACTIVITY_KEY = 'bmm:app-lock:last-active'
