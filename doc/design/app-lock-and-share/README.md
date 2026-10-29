# 应用锁与书签分享口令

## 功能范围

- **应用锁**：偏好设置中开启，支持九宫格（≥4 点）与 4 位数字密码；进入个人空间/后台前验证，浏览器关闭或 30 分钟无操作后重新上锁。
- **书签分享口令**：书签列表分享按钮生成短口令，其他用户可在「新建书签」页粘贴口令（或整段分享文字），自动填入名称、网址、图标、描述、标签后保存；打开页面时会尝试读取剪贴板并弹窗提示导入。

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
| 关闭应用锁 | 在偏好设置中关闭时必须验证当前应用锁密码，或改用账号密码验证 |
| 退出登录 | `NavUser` 退出前清理解锁 Cookie，重新登录仍需验证应用锁 |

### 书签分享

| 项目 | 方案 |
| --- | --- |
| 口令格式 | `BMM-XXXXXXXX`，8 位大写字母/数字（去掉易混淆的 I/O/0/1），共 12 个字符 |
| 口令存储 | 复用 `userConfigs`：key = `bookmark.share.<code>`，value = `{bookmarkId, expiresAt}`；不新增数据表，无需迁移 |
| 有效期 | 7 天；同一书签重复分享复用未过期口令；过期、篡改、书签删除均返回中文错误 |
| 输入清洗 | `normalizeBookmarkShareCode` 从任意文本中提取口令，自动忽略前后说明、空格、换行；也接受不带前缀的 8 位口令 |
| 自动读取剪贴板 | 新建书签页挂载时调用 `navigator.clipboard.readText()`，识别到口令后弹窗询问是否导入；无权限时静默降级为手动粘贴 |
| 分享内容 | 分享弹窗展示书签名称、网址、描述与标签（名称/图标/颜色）；接收方按标签名匹配自己的已有标签 |
| 落地位置 | 用户书签列表操作列「分享」按钮；新建书签页顶部「导入分享口令」面板 |

## 截图

均为真实页面截图，`overview.png` 为截图拼接总览：

| 文件 | 内容 |
| --- | --- |
| `settings-lock-light.png` / `settings-lock-dark.png` | 偏好设置中的应用锁卡片（明/暗） |
| `app-lock-disable-modal.png` | 关闭应用锁前的身份验证（应用锁密码或账号密码） |
| `lock-pattern.png` / `lock-pin.png` | 九宫格锁屏 / 数字密码锁屏 |
| `share-modal.png` | 分享口令弹窗（含书签与标签信息） |
| `share-clipboard-dialog.png` | 读取剪贴板后自动弹出的导入提示 |
| `share-import-form.png` | 新建书签页导入口令并自动填充 |
| `mobile-lock.png` / `mobile-settings.png` | 移动端锁屏与设置 |

## 验证

详见 [VERIFY-REPORT.md](./VERIFY-REPORT.md)：tsc 通过、vitest 全量通过、ESLint 新增文件通过；已用真实页面验证分享导入、九宫格/数字密码解锁、错误提示、空闲自动上锁、跨用户隔离与移动端布局。
