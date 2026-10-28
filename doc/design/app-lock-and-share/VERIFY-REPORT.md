# 应用锁与书签分享口令 — 端到端验收报告

- 执行人：verifier（t3）
- 时间：2026-10-28 17:00–17:35（Asia/Hong_Kong）
- 仓库：D:\code\bmm
- 结论：**通过**（无 blocker；发现 6 条低优先级改进项）

## 1. 代码检查

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 越界修改 | 通过 | 仅 app.config / actions / controllers / 三个 layout / settings / BookmarkListPage / BookmarkSlugPage / NavUser 及新增文件；无 package.json、无配置乱改 |
| `as any` / `@ts-ignore` | 通过 | 新增与改动文件 0 命中 |
| 中文文案 | 通过 | 锁屏、设置、分享、错误提示均为中文 |
| 明暗主题类 | 通过 | `AppLockScreen`、`AppLockSettings`、PinPad/PatternPad 均含 `dark:` 变体；实机深浅色截图正常 |
| 拦截在业务查询之前 | 通过 | `src/app/user/layout.tsx:23-37`、`src/app/admin/layout.tsx:23-38` 先取 gate，再查 tags/bookmarks；锁屏时直接 return，不渲染 children |
| 锁屏不渲染业务数据 | 通过 | 实机锁屏 DOM 仅含“应用已锁定/解锁控件/忘记密码/退出登录”，无书签数、标签数 |
| 分享口令 7 天有效期 | 通过 | `src/lib/share-code.ts:5` TTL=7 天；分享弹窗显示“7 天内有效（至 11/04 17:04）” |
| 错误提示合理 | 通过 | 空口令“请输入分享口令”；篡改/过期“口令无效或已过期”；书签删除“口令对应的书签不存在或已被删除”；错误图案/密码“解锁密码错误，请重试” |

## 2. 静态验证（最终代码，含 Captain 后续改动）

| 命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit --pretty false` | 通过（exit 0） |
| `pnpm exec vitest run` | 通过：27 个文件 passed、1 skipped；175 tests passed、3 skipped（178） |
| `pnpm lint` | 仅既存错误：`src/app/user/read-later/ClientPage.tsx:430` `react-hooks/set-state-in-effect`（exit 1） |
| `pnpm exec eslint <全部改动/新增文件>` | 通过（exit 0） |

## 3. 运行时验证（真实页面，Chromium + CDP）

分享口令：

1. 注册临时用户 A（verify-a-1793178062126@example.com）并登录。
2. `/user/bookmark/new` 新建「验证分享书签 / https://example.com / 来自用户 A 的分享功能验收」→ 保存成功，列表可见。
3. 列表点分享 → 生成 `BMM1.***` 口令，显示 7 天有效期。
4. 退出登录（导航头像菜单）→ 注册临时用户 B（verify-b-1793178461218@example.com）并登录。
5. `/user/bookmark/new` 粘贴非法口令 → 提示「口令无效或已过期」，输入保留。
6. 粘贴有效口令 → 名称/网址/描述自动填充 → 保存成功，列表共 1 项。

应用锁：

1. 偏好设置开启九宫格（图案 0-4-8-5）→ 显示“已开启 · 九宫格解锁”。
2. 退出登录 → 同账号重新登录 → 出现锁屏（未渲染任何业务数据）。
3. 错误图案 → “解锁密码错误，请重试”；正确图案 → 解锁成功。
4. 修改为数字密码 1234 → 退出/重登 → 数字键盘锁屏；错误 9999 → 报错；正确 1234 → 解锁。
5. 刷新后重新上锁：`localStorage` 最近活动改为 31 分钟前并整页刷新 → 自动上锁；再次刷新仍保持锁定。
6. 跨用户：登录未设置应用锁的用户 A → 直接进入 `/user`，B 的解锁态未共享（token 内含 userId 校验）。
7. 手机 390x844：锁屏与设置卡片布局正常。

## 4. 发现（均为低优先级，无 blocker）

1. `src/components/AppLockIdleGuard.tsx:14,32` — 活动时间 localStorage key 不区分用户。同一浏览器先后登录两个带锁账号时会互相影响空闲判断。建议 key 拼接 userId。
2. `src/lib/app-lock.ts:25-32` — 解锁 Cookie 只校验 userId，未使用 `issuedAt`；30 分钟空闲完全依赖客户端 Guard。Guard 未运行/标签页冻结时解锁态可延续到浏览器关闭。建议服务端同时校验 `Date.now() - issuedAt < APP_LOCK_IDLE_MS`。
3. `src/components/AppLockIdleGuard.tsx:78-80` — 只监听 pointerdown/keydown/touchstart，滚轮滚动不算活动，长时间滚轮阅读可能被误锁。建议增加 wheel/scroll 节流更新或 pointermove。
4. `src/components/app-lock/AppLockPatternPad.tsx:118-133` — 九宫格仅指针绘制，无可聚焦元素，键盘/读屏用户无法独立使用（有“忘记解锁密码”兜底）。建议在设置页提示可改用数字密码。
5. `src/components/BookmarkShareImport.tsx:16,44` — `sourceUserName` 已返回但未展示。建议导入成功提示“来自 X 的分享”。
6. `src/components/NavUser.tsx:1-6` — 新增 import 位置与仓库“外部依赖→内部 @/→组件”约定不一致（既有文件风格，非功能问题）。
7. 信息：`src/app/layout.tsx:41-47` 公开页也会查询应用锁配置，每请求多一次 DB 查询；可接受。

## 5. 截图（真实页面，非设计稿）

- `D:\code\bmm\doc\design\app-lock-and-share\settings-lock-light.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\settings-lock-dark.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\lock-pattern.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\lock-pin.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\share-modal.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\share-import-form.png`（1440x900）
- `D:\code\bmm\doc\design\app-lock-and-share\mobile-lock.png`（390x844）
- `D:\code\bmm\doc\design\app-lock-and-share\mobile-settings.png`（390x844）

## 6. 清理

- 已删除 2 个测试用户（A/B）及其级联数据：剩余测试用户 0、测试书签 0、应用锁配置 0；数据库当前无用户。
- 已停止验收用 headless Chromium 并删除临时 profile。
- dev server：端口 3100 的 `next dev`（PID 41896）在验收开始前已存在（14:23 启动），非本次启动，未擅自终止。
- 验收脚本与中间截图保留在 `tmp/e2e/`（未跟踪）。
