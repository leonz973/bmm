# 应用锁与书签分享口令

## 功能范围

- **应用锁**：偏好设置中开启，支持九宫格（≥4 点）与 4 位数字密码；进入个人空间/后台前验证，浏览器关闭或 30 分钟无操作后重新上锁。
- **书签分享口令**：书签列表分享按钮生成口令，其他用户可在「新建书签」页粘贴口令，自动填入名称、网址、图标、描述及同名标签后保存。

## 实现要点

### 应用锁

| 项目 | 方案 |
| --- | --- |
| 配置存储 | `userConfigs`，key = `user.appLock`，存 `method` + `salt` + `scrypt` 哈希，不存明文 |
| 解锁凭据 | HttpOnly、SameSite=Lax 的**会话 Cookie**（浏览器关闭即失效），值为 HMAC-SHA256 签名的 `{type,userId,issuedAt}` |
| 跨用户隔离 | Cookie 中的 `userId` 必须与当前登录用户一致 |
| 长时间未使用 | 前端 `AppLockIdleGuard` 记录最近活动（localStorage 按 userId 隔离），30 分钟无操作调用 `actLockApp` 并刷新；滚轮/滚动/触摸/键盘均算活动 |
| 强制拦截 | `src/app/user/layout.tsx` 与 `src/app/admin/layout.tsx` 在查询 tags/bookmarks 之前调用 `getGateState`，锁定时只渲染 `AppLockScreen` |
| 忘记密码 | 锁屏内可用当前账号密码关闭应用锁（`actResetAppLockWithPassword`） |
| 退出登录 | `NavUser` 退出前清理解锁 Cookie，重新登录仍需验证应用锁 |

### 书签分享

| 项目 | 方案 |
| --- | --- |
| 口令格式 | `BMM1.<base64url(payload)>.<HMAC-SHA256>`，payload 含 bookmarkId/userId/expiresAt |
| 有效期 | 7 天，过期/篡改/书签删除均返回中文错误 |
| 落地位置 | 用户书签列表操作列「分享」按钮 → 只读口令弹窗 + 复制；新建书签页顶部「导入分享口令」面板 |
| 标签 | 按标签名匹配接收方已有标签，不自动创建 |

## 截图

均为 1440×900 桌面或 390×844 移动端真实页面截图，`overview.png` 为 8 张截图的拼接总览：

| 文件 | 内容 |
| --- | --- |
| `settings-lock-light.png` / `settings-lock-dark.png` | 偏好设置中的应用锁卡片（明/暗） |
| `lock-pattern.png` / `lock-pin.png` | 九宫格锁屏 / 数字密码锁屏 |
| `share-modal.png` | 分享口令弹窗 |
| `share-import-form.png` | 新建书签页导入口令并自动填充 |
| `mobile-lock.png` / `mobile-settings.png` | 移动端锁屏与设置 |

## 验证

详见 [VERIFY-REPORT.md](./VERIFY-REPORT.md)：tsc 通过、vitest 175 passed / 3 skipped、ESLint 新增文件通过；真实页面已验证分享导入、九宫格/数字密码解锁、错误提示、空闲 31 分钟自动上锁、跨用户隔离与 390×844 布局。
