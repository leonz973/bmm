# 应用锁与书签分享口令 — 端到端验收报告

- 执行人：verifier（初始版本）+ Captain（2026-10-29 短口令/剪贴板更新）
- 时间：2026-10-28 17:00–17:35；2026-10-29 09:00–13:50（Asia/Hong_Kong）
- 仓库：D:\code\bmm
- 结论：**通过**（无 blocker；剩余 4 条低优先级说明）

## 1. 代码检查

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 越界修改 | 通过 | 仅 app.config / actions / controllers / 三个 layout / settings / BookmarkListPage / BookmarkSlugPage / NavUser 及新增文件；无 package.json、无配置乱改 |
| `as any` / `@ts-ignore` | 通过 | 新增与改动文件 0 命中 |
| 中文文案 | 通过 | 锁屏、设置、分享、错误提示均为中文 |
| 明暗主题类 | 通过 | `AppLockScreen`、`AppLockSettings`、PinPad/PatternPad 均含 `dark:` 变体；实机深浅色截图正常 |
| 拦截在业务查询之前 | 通过 | `src/app/user/layout.tsx:23-37`、`src/app/admin/layout.tsx:23-38` 先取 gate，再查 tags/bookmarks；锁屏时直接 return，不渲染 children |
| 锁屏不渲染业务数据 | 通过 | 实机锁屏 DOM 仅含“应用已锁定/解锁控件/忘记密码/退出登录”，无书签数、标签数 |
| 短口令 | 通过 | `BMM-XXXXXXXX`，8 位大写字母/数字（去掉 I/O/0/1）；复用 `userConfigs` 存储，不新增表、无需迁移 |
| 输入清洗 | 通过 | `normalizeBookmarkShareCode` 可从“请查收 BMM-XXXXXXXX，谢谢”中提取口令；支持不带前缀的 8 位口令 |
| 错误提示合理 | 通过 | 空口令“请输入分享口令”；非法/过期“口令无效或已过期”；书签删除“口令对应的书签不存在或已被删除”；错误图案/密码“解锁密码错误，请重试” |

## 2. 静态验证（最终代码）

| 命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit --pretty false` | 通过（exit 0） |
| `pnpm exec vitest run` | 通过：27 个文件 passed、1 skipped；179 tests passed、3 skipped（182） |
| `pnpm lint` | 仅既存错误：`src/app/user/read-later/ClientPage.tsx:430` `react-hooks/set-state-in-effect`（exit 1） |
| `pnpm exec eslint <全部改动/新增文件>` | 通过（exit 0） |

## 3. 运行时验证（真实页面，Chromium + CDP）

分享口令：

1. 使用 `shot@example.com` 登录，书签列表中存在「分享验证书签 / https://example.com/shot / 用于验证短口令、标签信息和剪贴板自动识别。」及标签「验证标签」。
2. 点分享按钮 → 生成 `BMM-XPG9QBER` 这类 12 字符短口令，弹窗展示书签名称/网址/描述/标签（名称、图标、颜色），显示 7 天有效期。
3. 将剪贴板写入 `请查收 BMM-XPG9QBER，谢谢！` 后打开 `/user/bookmark/new` → 自动弹出「检测到分享口令」；口令被自动过滤为 `BMM-XPG9QBER`。
4. 点「立即导入」→ 网址、名称、图标、描述自动填充，标签「验证标签」自动选中，面板显示“已导入…来自…标签：验证标签”。
5. 单元测试覆盖：同一书签重复分享复用口令、说明文字中提取口令、篡改口令无效、无后缀裸口令识别。

应用锁（沿用 2026-10-28 已验证结果）：

1. 九宫格（0-4-8-5）与数字密码（1234）均可开启、修改、解锁；错误输入提示“解锁密码错误，请重试”。
2. 退出登录后重新登录会出现锁屏，且锁屏不渲染业务数据；空闲 31 分钟自动上锁，刷新保持锁定。
3. 跨用户不共享解锁态；390x844 移动端布局正常。
4. 应用锁设置了 `userId` 绑定的会话 Cookie；退出登录会清除解锁凭据。
5. 关闭应用锁时必须验证：默认输入当前应用锁密码（九宫格/数字密码），也可切换为账号密码；错误 PIN 提示“应用锁密码错误，请重试”，正确 PIN 可关闭；账号密码路径有单元测试覆盖。

## 4. 发现（低优先级，无 blocker）

1. `src/lib/app-lock.ts:25-32` — 解锁 Cookie 未使用 `issuedAt` 做服务端超时判断；30 分钟空闲依赖客户端 `AppLockIdleGuard`。这是为了不误锁持续活跃用户，浏览器关闭仍由会话 Cookie 兜底。
2. `src/components/app-lock/AppLockPatternPad.tsx:118-133` — 九宫格仅支持指针绘制，键盘/读屏用户无法独立使用（有“忘记解锁密码”兜底，可改用数字密码）。
3. `src/components/BookmarkShareImport.tsx` — 自动读取剪贴板依赖浏览器安全上下文和权限（HTTPS 或 localhost）；HTTP 部署下浏览器可能拒绝，此时仍可手动粘贴，`onValueChange` 同样会自动过滤文字。
4. `src/app/layout.tsx:41-47` — 公开页也会查询应用锁配置，每请求多一次 DB 查询；当前数据量下可接受。

## 5. 截图（真实页面，非设计稿）

- `D:\code\bmm\doc\design\app-lock-and-share\settings-lock-light.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\settings-lock-dark.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\app-lock-disable-modal.png`（1440x900，关闭应用锁验证）
- `D:\code\bmm\doc\design\app-lock-and-share\lock-pattern.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\lock-pin.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\share-modal.png`（1440x900，短口令 + 标签信息）
- `D:\code\bmm\doc\design\app-lock-and-share\share-clipboard-dialog.png`（1440x900，剪贴板自动识别弹窗）
- `D:\code\bmm\doc\design\app-lock-and-share\share-import-form.png`（1440x900，导入后填充）
- `D:\code\bmm\doc\design\app-lock-and-share\mobile-lock.png`（390x844）
- `D:\code\bmm\doc\design\app-lock-and-share\mobile-settings.png`（390x844）

## 6. 清理

- 已删除 `shot@example.com` 测试用户及其级联数据（测试书签、标签、分享口令、应用锁配置）。
- 已停止验收用 headless Chromium 并删除临时 profile。
- dev server：端口 3100 的 `next dev`（PID 41896）在验收开始前已存在，非本次启动，未擅自终止。
