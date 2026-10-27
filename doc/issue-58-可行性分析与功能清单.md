# Issue #58 可行性分析与功能清单

> 分析对象：[Y80/bmm#58](https://github.com/Y80/bmm/issues/58)「请求支持 路由管理 & 密码分类 & 可选布局 & 社交卡片」
> 代码基线：`main` @ `61ea4ad`（2026-10-27）
> 分析范围：公共空间（`/`、`/tags/*`、`/search`、`/random`）为主，用户空间单列评估

---

## 一、结论先行

四组需求**全部可行**，但它们的成本和风险差异很大，不适合当作一个整体功能来做。

| 需求 | 可行性 | 改动量 | 主要风险 | 建议 |
| --- | --- | --- | --- | --- |
| 可选布局（grid / list / compact） | 高 | S（约 3.5 人日） | 低，纯展示层 | 先做，收益最直接 |
| 社交卡片（微信/QQ/电话/邮箱/深链） | 高 | M（约 5.5 人日） | 中，深链兼容性、二维码存储 | 先做，和 compact 布局组合即「社交名片」 |
| 路由管理（专题） | 高 | L（约 9 人日） | 中，数据模型与导航改动面大 | 作为骨架做，布局/密码都依赖它 |
| 密码分类 | 中高 | L（约 7.5 人日） | **高，容易从搜索/标签/随机入口泄漏** | 最后做，必须先统一可见性过滤 |

**总量级**：公共空间完整实现约 **27 人日**，含联调与回归约 **30–33 人日**（单人 6–7 周；两人并行可压到 4 周左右）。若同步做用户空间，工作量接近翻倍。

**一句话判断**：这不是「缝合怪」，而是把 BMM 从「书签导航站」扩展成「可分组、可展示、可受限访问的链接页」。真正的难点不是 UI，而是**专题的数据边界**和**密码的可见性边界**。

---

## 二、现状盘点

| 能力 | 现状 | 与 issue 的差距 |
| --- | --- | --- |
| 页面路由 | 固定三套空间：公共 `/`、用户 `/user`、后台 `/admin`；标签筛选页 `/tags/[slug]` | 没有「专题」实体，无法按社交/工作隔离 |
| 书签组织 | 标签多对多（`publicBookmarkToTag` / `userBookmarkToTag`），支持主标签 `isMain` | 标签是横向分类，不是互斥分组；不能承载独立路由、独立布局、独立密码 |
| 列表布局 | 单一 grid：`repeat(auto-fill, minmax(min(100%, 280px), 1fr))`，移动端单列；卡片固定展示三行描述 | 无 list / compact 变体，无移动端列数配置，无法按分类切换 |
| 访问控制 | 仅账号登录（NextAuth + `credentials` 表，PBKDF2）；无页面级/分类级密码；无 `middleware.ts` | 分类密码从零实现 |
| 书签点击 | `BookmarkCard` 整卡 `window.open(url)`；`url` 必填且全局唯一 | 没有 action 类型、二维码、复制微信号、`tel:`/`mailto:`/深链处理 |
| 查询入口 | RSC 首屏 + 客户端 `LoadMore`（`actFindPublicBookmarks`，`guard: false`）；`findMany` / `random` / `total` / `recent` / `search` 各自直查 | 密码过滤必须覆盖全部入口，漏一个就泄漏 |
| 后台 CRUD | 书签、标签的列表/编辑/批量操作完整，HeroUI Table + 表单模式成熟 | 专题管理可照搬，成本可控 |
| 文件存储 | 无对象存储；`/admin/upload` 只是浏览器书签导入 | 二维码只能先用图片 URL，不能做上传 |
| 数据模型 | SQLite 与 PostgreSQL 两套 schema 平行维护 | 任何字段改动都要双份 + 双份迁移 |

关键代码位置：

- 路由常量：`app.config.ts` `PageRoutes`
- 公共布局：`src/app/(public)/layout.tsx`
- 首屏：`src/app/(public)/page.tsx` → `src/app/(public)/components/PublicHomeBody.tsx` → `src/components/HomeBody/index.tsx`
- 卡片与容器：`src/components/HomeBody/components/BookmarkCard.tsx`、`BookmarkContainer.tsx`
- 分页：`src/components/HomeBody/components/LoadMore.tsx`
- 公共查询：`src/controllers/PublicBookmark.controller.ts`
- 书签表单：`src/components/BookmarkSlugPage.tsx`
- 数据模型：`src/db/sqlite/schemas/public.ts`、`src/db/postgres/schemas/public.ts`

---

## 三、关键设计决策

### 3.1 用新的「专题（Collection）」实体，而不是复用标签

| 方案 | 优点 | 致命问题 | 结论 |
| --- | --- | --- | --- |
| A. 新增 `publicCollections` 表，书签单归属 | 隔离语义清晰；密码、布局、路由、排序都有明确宿主；查询简单 | 新表 + 后台 CRUD + 迁移，约 9 人日 | **推荐** |
| B. 把标签当专题（`/tags/social`） | 复用现有标签页、后台、M:N 关系，约 3–4 人日 | 标签是多对多：一个书签可同时属于「社交」和「工作」，密码和布局会互相打架；标签页本质是筛选视图，不是独立页面 | 否决 |
| C. 标签加 `isCollection` 约束单归属 | 部分复用标签 UI | 退化成「带额外约束的专题」，仍要加 slug/密码/布局字段，省不了多少，语义更混乱 | 否决 |

专题和标签的分工：

- **专题**：互斥的「放在哪」，决定路由、布局、可见性、密码。一个书签最多属于一个专题。
- **标签**：横向的「是什么」，继续多对多，用于搜索和聚合。

### 3.2 书签单归属，而不是多对多

密码和布局都是专题级配置。若一个书签能进多个专题，就会出现「社交专题设了密码，但工作专题里还能看到它」的泄漏路径。**单归属是安全边界，不是偷懒**。需要跨专题展示时用标签。

### 3.3 路由形态：`/c/[slug]`

| 方案 | 示例 | 评价 |
| --- | --- | --- |
| 顶层动态段 | `/social` | 最短好看，但要维护 `tags/search/random/welcome/login/admin/user/api/forbidden/_next` 等保留字；未来每加一个静态页都要防冲突；拼错 URL 会落进专题 404 |
| 固定前缀 | `/c/social` | 零冲突、语义明确、实现最稳；只多两个字符 | **推荐 MVP** |
| 复用标签页 | `/tags/social` | 成本最低，但把「标签」和「专题」永久绑死 | 否决 |

如果后续确实想要 `/social`，可以在 `next.config` 用 rewrite 把白名单 slug 映射到 `/c/[slug]`，静态路由优先级更高，不会抢现有页面。这属于 P2 打磨，不影响数据模型。

### 3.4 密码是「数据可见性」，不是「页面遮罩」

这是整个 issue 里最容易做错的地方。只在专题页加一个密码弹窗、校验通过后渲染书签，是不够的：

- `/search?keyword=xxx` 会直接返回受保护书签；
- `/random` 会随机抽出受保护书签；
- `/tags/[slug]` 会把受保护书签混进标签结果；
- 首屏 RSC payload 里可能已经带了数据；
- `LoadMore` 的 server action 可以被单独调用。

因此密码必须落在**查询层**：所有公共书签查询统一追加「可见专题」条件，专题页只是决定「当前请求解锁了哪些专题」。具体见 4.3。

### 3.5 先做公共空间，用户空间后续同步

`publicBookmarks` 与 `userBookmarks`、`publicTags` 与 `userTags` 是两套平行 schema。四组需求如果同时覆盖公共和用户空间，工作量约 ×1.8。issue 描述的场景（个人主页、社交名片、工作/社交隔离）主要发生在公共空间，建议**公共空间先行**，用户空间在模型稳定后复制。

### 3.6 社交卡片：保留 `url`，用伪 URL 承载非网页动作

`url` 目前是 `notNull().unique()`，且 `getBookmarkHost()` 只接受 `http/https`。若把 `url` 改成可空，会波及唯一索引、host 检测、AI 解析、导入导出等大量代码。

更小的改法是保留 `url`，为社交动作生成稳定的伪 URL：

- 微信：`wechat://<微信号>`
- QQ：`qq://<QQ号>`
- 电话：`tel:<号码>`
- 邮箱：`mailto:<地址>`
- 自定义深链：原样保存

这样唯一约束仍然成立，`hostKey` 自然为 `null`（现有 schema 允许），host 检测对这些条目显示「不支持检测」即可。真正的点击行为由 `actionType` 决定，`url` 只作为兜底/复制值。

### 3.7 布局作用域：全局默认 + 专题覆盖 + 单书签微调

- 全局默认放 `siteConfigs`（key 例如 `site.layout`），保证没有专题时行为不变；
- 专题的 `layout` 可空，空则继承全局；
- 单书签只加一个 `hideDescription` 布尔值，解决「有些社交链接完全不需要描述」；
- 不做任意 per-card CSS / 拖拽布局，避免把导航站做成页面编辑器。

---

## 四、四组需求的具体方案

### 4.1 路由管理（专题）

> 本文统一把这种「互斥的内容分组」叫**专题（Collection）**，也可以叫分组/频道；它和标签是两套东西。

#### 数据模型

```ts
// src/db/sqlite/schemas/public.ts（postgres 同步一份）
export const publicCollections = sqliteTable('publicCollections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // [a-z0-9-]{1,32}，保留字校验
  description: text('description'),
  icon: text('icon'),
  color: text('color'),
  layout: text('layout', { mode: 'json' }).$type<CollectionLayout>(),
  visibility: text('visibility', { enum: ['public', 'password', 'private'] })
    .notNull()
    .default('public'),
  passwordHash: text('passwordHash'), // scrypt$N$r$p$salt$hash
  accessVersion: integer('accessVersion').notNull().default(0),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
```

`publicBookmarks` 增列：

```ts
collectionId: integer('collectionId').references(() => publicCollections.id, {
  onDelete: 'set null', // 删除专题不删书签，回落为「未分组」
}),
```

加索引：`index('publicBookmarks_collectionId_idx').on(table.collectionId)`。

`CollectionLayout`：

```ts
type CollectionLayout = {
  mode?: 'grid' | 'list' | 'compact'
  mobileCols?: 1 | 2 | 3
  showDescription?: boolean
  showTags?: boolean
}
```

#### 行为设计

- 首页 `/` 保持现状：展示全部可见书签（未分组 + 公共专题），零回归；
- 专题页 `/c/[slug]`：只展示该专题书签，页头展示专题图标、名称、描述；
- 导航栏增加专题入口；专题多时横向滚动，移动端收进菜单；
- 后台 `/admin/collection/list`、`/admin/collection/new`、`/admin/collection/[id]`，沿用标签后台的 `list | new | id` 模式；
- 书签表单增加「所属专题」下拉，可空（未分组）；后台列表支持按专题筛选、批量修改专题；
- 删除专题时二次确认，文案说明「书签将变为未分组，不会被删除」；
- slug 修改需提示「旧链接会失效」；MVP 不做别名跳转。

#### 改动面

| 文件 | 改动 |
| --- | --- |
| `src/db/{sqlite,postgres}/schemas/public.ts` | 新表 + 书签外键 + 索引 |
| `src/db/*/migrations/*` | 双份迁移 |
| `src/controllers/PublicCollection.controller.ts` | 新增 CRUD、按 slug 查询、排序 |
| `src/controllers/schemas.ts` | `collectionSchema`、`findManyBookmarksSchema` 增 `collectionId` |
| `src/actions/index.ts` | 专题 actions，`make(..., { guard: 'admin' })` |
| `app.config.ts` | `PageRoutes.Public.collection(slug)`、`Admin.collectionSlug` |
| `src/app/(public)/c/[slug]/page.tsx` | 新页面 + `generateMetadata` + `notFound()` |
| `src/app/(public)/layout.tsx` | 向导航注入专题列表 |
| `src/components/PublicAndUserNavBar.tsx` | 专题入口 |
| `src/components/BookmarkSlugPage.tsx` | 专题选择 |
| `src/components/BookmarkListPage.tsx` | 专题列 + 筛选 + 批量改归属 |
| `src/components/HomeBody/components/LoadMore.tsx` | 专题页分页参数 |
| `src/app/admin/collection/*`、`src/app/admin/ctx.tsx` | 后台页面与上下文 |

#### 风险与边界

- **slug 冲突**：集中维护保留字列表，创建/修改时校验；数据库唯一索引兜底。
- **首页聚合语义**：MVP 保持「全部书签」聚合，不做「专题首页」；否则改动首屏结构，回归面变大。
- **SEO**：专题页输出独立 title/description；`password`/`private` 专题加 `robots: noindex`。
- **性能**：专题页查询按 `collectionId` 走索引；导航只查专题元数据，不查书签。
- **现有 `params.slug` 假设**：`HomeBody/index.tsx` 会把 `useParams().slug` 当作标签名来高亮；`/c/[slug]` 的 slug 是专题名，必须把这段逻辑收窄到 `/tags/*` 路由，否则专题页可能误选同名标签。`LoadMore` 的 `params.slug` 分支同理。

#### 验收标准

1. 后台可创建/编辑/删除专题，slug 唯一且非法字符被拒绝；
2. `/c/social` 只出现该专题书签，未分组书签不出现在专题页；
3. 首页行为与改动前一致（除新增导航入口）；
4. 删除专题后，原书签仍在首页「未分组」中；
5. 移动端专题页无横向溢出，导航可用；
6. 书签表单可改归属，后台列表可按专题筛选。

---

### 4.2 可选布局

#### 三种模式

| 模式 | 适用 | 结构 | 移动端 |
| --- | --- | --- | --- |
| `grid` | 默认导航 | 现有卡片：图标 + 标题 + 三行描述 + 标签 | 1 列（现状） |
| `list` | 文档、云盘、需要看描述的链接 | 整行：左图标，中标题 + 1 行描述，右标签；行高 64–72px | 单列，描述可折行 |
| `compact` | 社交名片、图标入口 | 图标 + 单行短标题，无描述/标签；卡片高 88–104px | 2 或 3 列 |

`compact` 就是 issue 里说的「单图标短标题卡片」，配合 4.4 的社交动作，就是社交名片形态。

#### 配置

- 全局默认：`siteConfigs` key `site.layout`，默认 `{ mode: 'grid', mobileCols: 1, showDescription: true, showTags: true }`；
- 专题覆盖：`publicCollections.layout`，空字段逐项回退全局；
- 单书签：`hideDescription` 布尔值，优先级最高；
- 移动端列数只对 `compact` 有意义，限制 1–3，避免 4 列挤爆。

#### 实现要点

- `BookmarkContainer` 不再写死 `gridTemplateColumns`，由 `layout` 计算：
  - `compact` + `mobileCols=2`：`repeat(2, minmax(0, 1fr))`，`xs` 以上 `repeat(auto-fill, minmax(160px, 1fr))`；
  - `grid`：保持现有 280px 自适应；
  - `list`：`display: flex; flex-direction: column`，行之间用 `border-divider`。
- `BookmarkCard` 拆成三个展示组件或一个带 `variant` 的组件；建议拆文件，避免单文件继续膨胀：
  - `BookmarkGridCard.tsx`（现有逻辑迁移）
  - `BookmarkListRow.tsx`
  - `BookmarkCompactCard.tsx`
- 三种变体共用 `useBookmarkAction()`（见 4.4），保证点击行为一致；
- 触控目标 ≥ 44px；`compact` 卡片整卡可点；
- 明暗主题沿用 `content1` / `border-divider` / 半透明表面，不新增配色。

#### 改动面

`HomeBody/index.tsx`（接收 `layout` 并下发）、`PublicHomeBody.tsx`、`BookmarkContainer.tsx`、`BookmarkCard.tsx` 拆分、专题后台表单增加布局区、`SiteSetting` 增加全局布局、`src/controllers/SiteSetting.controller.ts`。

#### 验收标准

1. 三种模式在 375px / 768px / 1440px 下均无溢出；
2. `compact` 移动端可选 2/3 列，点击区域 ≥ 44px；
3. 未配置布局时与现状完全一致；
4. 单书签 `hideDescription` 在 grid/list 下都生效；
5. 明暗主题对比度通过现有设计规范走查。

---

### 4.3 密码分类

#### 语义

- `visibility = 'public'`：正常展示；
- `visibility = 'password'`：页面可访问，但需输入专题密码；解锁后 30 天内免输；
- `visibility = 'private'`：仅管理员可见，公开访问一律 404（不暴露存在性）。

密码粒度：**一个专题一个密码**。适用于 issue 里说的社交账号主页、云盘分享、内部文档等场景。不支持每书签独立密码（会把管理成本推高，也不符合「分类」语义）。

#### 威胁模型

这是「防君子不防小人」的访问限制：目标是挡住随手点开的访客和搜索引擎，不是抵抗定向攻击。因此需要：

- 服务端校验，绝不在客户端比对密码；
- 密码用 `scrypt`（Node 内置）加盐哈希，不用现有账号的 1000 次 PBKDF2；
- 恒定时间比较 `timingSafeEqual`；
- 简单的失败限流（同一 IP + 专题，10 分钟内 5 次失败后冷却）；
- 修改密码时递增 `accessVersion`，使旧 Cookie 全部失效。

#### 解锁流程

1. 访问 `/c/[slug]`，服务端查专题；
2. `private` 且非管理员 → `notFound()`；
3. `password` 且 Cookie 无效 → 只渲染密码页（专题名/图标/描述 + 输入框），**不查询书签**；
4. 提交 server action `actUnlockCollection({ slug, password })`；
5. 校验成功，`Set-Cookie`：

```text
bmm_col_<id>=<version>.<expiresAt>.<base64url(HMAC-SHA256(secret, `${id}.${version}.${expiresAt}`))>
HttpOnly; SameSite=Lax; Secure(生产); Path=/; Max-Age=2592000
```

6. 重新渲染专题页；Cookie 无效/过期/版本不匹配都回到密码页。

`secret` 优先用独立的 `COLLECTION_SECRET`，缺省回退 `AUTH_SECRET`；换密钥会使全部解锁失效，可接受。

#### 可见性过滤（核心）

新增 `src/lib/collection-access.ts`：

```ts
// 返回当前请求可见的专题 id：public 全部 + 已解锁的 password
export async function getVisibleCollectionIds(): Promise<CollectionId[]>
```

`PublicBookmarkController` 的每个公共查询入口统一追加：

```ts
or(isNull(publicBookmarks.collectionId), inArray(publicBookmarks.collectionId, visibleIds))
```

必须覆盖：

- `findMany()`（首页、专题页、标签页、搜索页、LoadMore）
- `random()`
- `total()`（导航栏计数）
- `recent()`
- `search()`（若仍被使用）

管理员不受限：`findMany` 内部读 `auth()`，`role === 'admin'` 时跳过过滤。注意 `BookmarkListPage` 也调用 `actFindPublicBookmarks`（`guard: false`），所以不能简单在 action 层加守卫，必须在 controller 内按会话区分。

`batchCheckHosts` 复用 `createFindManyFilters`，不能把可见性条件塞进这个共用函数，否则管理员批量检测会被误伤；应在 `findMany` 外层追加。

#### 残余风险

- 标签名、导航计数仍可能暴露「存在某个受保护专题」；可接受，若要彻底隐藏需连标签一起过滤（P2）；
- 多实例部署时内存限流不共享；自托管单实例足够，多实例需换 Redis/DB；
- 解锁后同一浏览器可访问该专题全部书签，符合预期；
- 密码通过 URL 查询参数传递的土办法禁止，必须 POST + Cookie。

#### 改动面

新增 `src/lib/collection-access.ts`、`src/components/CollectionPasswordGate.tsx`、`src/app/(public)/c/[slug]/page.tsx` 分支、`src/actions/index.ts` 的 `actUnlockCollection`；修改 `PublicCollection.controller.ts`、`PublicBookmark.controller.ts`、`src/controllers/schemas.ts`、专题后台表单、`.env.example`。

#### 验收标准

1. 未解锁访问 `/c/xxx` 只看到密码页，HTML/RSC 中不含任何书签标题或 URL；
2. 错误密码有明确提示，连续失败触发冷却；
3. 正确密码后 30 天内免输，换浏览器/清 Cookie 后需重新输入；
4. 修改密码后旧 Cookie 立即失效；
5. 未解锁时 `/search`、`/random`、`/tags/*`、首页、LoadMore 都不出现该专题书签；
6. 管理员登录后后台列表仍能看到全部书签；
7. `private` 专题对匿名用户返回 404，对管理员正常。

---

### 4.4 社交卡片

#### 动作类型

| `actionType` | 用户填写 | 点击行为 | `url` 存储 |
| --- | --- | --- | --- |
| `link` | 网址 | 新标签打开 | 原 URL |
| `wechat` | 微信号 + 二维码图片 URL | 弹层：二维码 + 复制微信号 + 「打开微信」`weixin://` | `wechat://<微信号>` |
| `qq` | QQ 号 | 移动端 `mqqwpa://im/chat?chat_type=wpa&uin=<号>`；桌面回退 `https://wpa.qq.com/msgrd?v=3&uin=<号>&site=qq&menu=yes` | `qq://<号>` |
| `phone` | 电话号码 | `tel:<号码>` | `tel:<号码>` |
| `email` | 邮箱 | `mailto:<地址>` | `mailto:<地址>` |
| `custom` | 任意深链/URL | 按 scheme 打开 | 原值 |

自媒体（YouTube/TikTok/Bilibili）和订阅平台（爱发电/OnlyFans/Coffee）本质仍是 `link`，只是图标和分类不同，不需要额外类型。

#### 数据字段

`publicBookmarks` 增列：

```ts
actionType: text('actionType', {
  enum: ['link', 'wechat', 'qq', 'phone', 'email', 'custom'],
}).notNull().default('link'),
actionValue: text('actionValue'), // 微信号 / QQ 号 / 电话 / 邮箱 / 深链
qrImage: text('qrImage'),         // 仅 wechat，图片 URL
```

`userBookmarks` 同步（若做用户空间）。

#### 交互细节

- **微信弹层**：HeroUI `Modal`；左侧二维码（普通 `<img>`，固定 200×200，不用 `next/image` 以免受 `remotePatterns` 限制），右侧微信号 + 复制按钮 + 「打开微信」；移动端上下堆叠；复制用 `navigator.clipboard`，失败回退 `document.execCommand('copy')` 并提示手动复制；`weixin://` 唤起失败不报错，提示「请手动打开微信扫一扫」。
- **QQ**：移动端优先深链，`setTimeout` 800ms 后检测页面是否仍可见，未见则跳转网页版；桌面直接网页版。
- **电话/邮箱**：`window.location.href = tel:/mailto:`，不要 `window.open`（会被拦截）。
- **自定义深链**：白名单 `https:`, `http:`, `tel:`, `mailto:`, `weixin:`, `mqqwpa:`, `alipays:`, `tg:` 等；禁止 `javascript:`, `data:`, `vbscript:`；非法值直接按普通文本展示并提示。
- **列表展示**：`BookmarkListPage` 增加「类型」列；非 `link` 类型隐藏「检测」按钮（无 hostKey）。
- **图标**：非 link 条目默认用内置平台图标（放到 `public/` 或复用 `Assets`），`icon` 仍可覆盖。注意 `Favicon` 组件目前只接受图片 URL，不支持 Iconify 类名；若要支持图标类名需单独扩展组件（P2），MVP 不引入。

#### 二维码存储

当前项目没有对象存储，`/admin/upload` 只是书签导入。MVP 只接受**图片 URL**；如果要做上传，需要新增文件存储、大小限制、清理策略和 Docker volume，建议单独立 issue，不塞进 #58。

#### 改动面

`src/db/{sqlite,postgres}/schemas/public.ts`、`BookmarkSlugPage.tsx`（类型切换 + 动态字段）、`src/controllers/schemas.ts`（action 校验、伪 URL 生成）、`PublicBookmark.controller.ts`（insert/update 时按 action 生成 `url` 与 `hostKey`）、`BookmarkCard.tsx` / 新 `SocialActionModal.tsx`、`src/utils/bookmark-action.ts`、`BookmarkListPage.tsx`。

#### 验收标准

1. 六种类型都能创建、编辑、删除，`link` 行为与现状一致；
2. 微信弹层能展示二维码、复制微信号、尝试唤起微信；
3. 电话/邮箱在 iOS/Android 能唤起系统应用；
4. `javascript:` 等非法深链被拒绝；
5. 同一微信号/QQ 号重复创建时给出「已存在」提示（由唯一索引兜底）；
6. 非 link 条目不参与 host 检测，不显示错误状态；
7. 移动端弹层不溢出，复制有成功/失败反馈。

---

## 五、功能清单（可拆 issue / PR）

> 估时为熟悉本仓库的单人开发，单位人日，不含设计评审与线上发布。

### Epic A：专题与路由

| ID | 功能 | 说明 | 优先级 | 依赖 | 估时 |
| --- | --- | --- | --- | --- | --- |
| A1 | 专题数据模型 | `publicCollections` + `publicBookmarks.collectionId` + 双库迁移 | P0 | 无 | 1.5 |
| A2 | 后台专题管理 | 列表/新建/编辑/删除、slug 校验、排序 | P0 | A1 | 2.5 |
| A3 | 公共专题页 | `/c/[slug]`、metadata、404、空状态 | P0 | A1/A2 | 1.5 |
| A4 | 导航与专题入口 | 桌面/移动导航、专题切换 | P0 | A3 | 1 |
| A5 | 书签归属 | 表单选择、后台筛选、批量修改 | P0 | A1 | 1.5 |
| A6 | 首页专题聚合 | 可选：按专题分区展示 | P2 | A3 | 1 |
| A7 | 短链美化 | `/{slug}` rewrite 白名单 | P2 | A3 | 0.5 |

### Epic B：可选布局

| ID | 功能 | 说明 | 优先级 | 依赖 | 估时 |
| --- | --- | --- | --- | --- | --- |
| B1 | 布局配置 | 全局默认 + 专题覆盖 + 后台表单 | P0 | A1（专题覆盖） | 1 |
| B2 | grid/list/compact 三种卡片 | 组件拆分与样式 | P0 | B1 | 1.5 |
| B3 | 移动端列数 | compact 1/2/3 列 | P0 | B2 | 0.5 |
| B4 | 单书签隐藏描述 | `hideDescription` | P1 | B2 | 0.5 |
| B5 | 布局预览 | 后台实时预览，可选 | P2 | B2 | 1 |

### Epic C：社交卡片

| ID | 功能 | 说明 | 优先级 | 依赖 | 估时 |
| --- | --- | --- | --- | --- | --- |
| C1 | 动作字段与校验 | `actionType/actionValue/qrImage`、伪 URL、scheme 白名单 | P0 | 无 | 1 |
| C2 | 表单类型切换 | 根据类型显示不同字段 | P0 | C1 | 1 |
| C3 | 微信弹层 | 二维码、复制、唤起微信 | P0 | C1 | 1.5 |
| C4 | QQ/电话/邮箱 | 深链与桌面回退 | P0 | C1 | 1 |
| C5 | 平台图标预设 | 常用平台图标与默认值 | P1 | C2 | 0.5 |
| C6 | 深链降级与提示 | 唤起失败兜底 | P1 | C4 | 0.5 |
| C7 | 点击统计 | 需要新增事件表，issue 未要求 | P2 | C1 | 1.5 |

### Epic D：密码分类

| ID | 功能 | 说明 | 优先级 | 依赖 | 估时 |
| --- | --- | --- | --- | --- | --- |
| D1 | 密码哈希与字段 | scrypt、`accessVersion`、设置/清除密码 | P0 | A1 | 1 |
| D2 | 解锁页与 Cookie | 密码页、签名 Cookie、30 天 | P0 | D1 | 2 |
| D3 | 全站可见性过滤 | findMany/random/total/recent/search/LoadMore | P0 | D2 | 2 |
| D4 | 修改密码失效 | 递增版本、清理旧 Cookie | P0 | D2 | 0.5 |
| D5 | 失败限流 | IP + 专题，5 次/10 分钟 | P1 | D2 | 0.5 |
| D6 | 私密专题 | `private`，匿名 404 | P1 | D2 | 0.5 |
| D7 | 安全回归用例 | 见 4.3 验收标准 | P0 | D3 | 1 |

### Epic E：收尾

| ID | 功能 | 说明 | 优先级 | 依赖 | 估时 |
| --- | --- | --- | --- | --- | --- |
| E1 | 移动端与明暗主题走查 | 375/768/1440，触控 44px | P0 | A–D | 1 |
| E2 | 文档与迁移说明 | README、环境变量、升级注意 | P1 | A–D | 0.5 |
| E3 | 用户空间同步 | `/user/c/[slug]`、用户专题 | P2 | A–D | 6–8 |

**公共空间合计**：A 9 + B 3.5 + C 5.5 + D 7.5 + E 1.5 = **27 人日**，加 15–20% 联调回归约 **31–33 人日**。合计不含 P2 项（A7、B5、C7、E3）。

---

## 六、实施顺序

### 推荐路径（架构优先）

```text
A1 专题模型
  ├─ A2 后台专题 ─ A3 专题页 ─ A4 导航
  ├─ B1 布局配置 ─ B2 三种卡片 ─ B3 移动列数
  └─ D1 密码字段 ─ D2 解锁页 ─ D3 可见性过滤 ─ D7 安全用例
C1 社交字段 ─ C2 表单 ─ C3 微信 ─ C4 其他类型   （可与 A/B 并行）
```

- **第 1 周**：A1 + A2，先把专题跑通；
- **第 2 周**：A3 + A4 + A5，专题页可用；
- **第 3 周**：B1–B3，布局变体；
- **第 4 周**：C1–C4，社交卡片；
- **第 5 周**：D1–D3，密码与可见性；
- **第 6 周**：D4–D7 + E1–E2，回归、移动端、文档。

### 价值优先（想尽快发版）

先做 C（社交卡片）+ B（全局布局，不依赖专题），约 2 周即可得到「社交名片」效果；再做 A，最后 D。代价是 B 的专题覆盖要等 A 完成后补一次，约多 0.5 人日。

### 并行建议

- 一人做 A（模型/后台/路由），一人做 C（纯书签字段 + 前端交互），冲突点只在 `publicBookmarks` schema 与 `BookmarkSlugPage`，可先约定字段；
- B 依赖 A1 的 `collectionId` 才能做「专题覆盖」，但三种卡片本身可以先做；
- D 必须等 A 和所有查询入口稳定后再动，避免反复改过滤条件。

---

## 七、风险清单

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 密码从搜索/标签/随机/LoadMore 泄漏 | 高 | 高 | 查询层统一过滤；D7 用例覆盖每个入口；代码评审清单 |
| 用户误以为密码是强安全 | 中 | 中 | 文档写明「访客级保护」；限流；不用于敏感数据 |
| SQLite/Postgres schema 漂移 | 中 | 中 | 双份 schema + 双份迁移 + CI 跑两套测试 |
| `url` 唯一约束与伪 URL 冲突 | 中 | 低 | 伪 URL 含业务值；重复时明确报错 |
| 微信/QQ 深链在部分浏览器被拦截 | 高 | 低 | 始终提供二维码 + 复制兜底 |
| 二维码无对象存储 | 高 | 低 | MVP 只收图片 URL；上传另立 issue |
| slug 与现有/未来路由冲突 | 中 | 中 | `/c/` 前缀 + 保留字校验 |
| 公共/用户空间重复实现 | 高 | 中 | 公共先行；用户空间复制时抽公共常量，不做大重构 |
| 首页聚合与专题页重复内容 SEO | 中 | 低 | canonical；password/private noindex |
| 专题页导航数据 N+1 | 低 | 低 | 导航只查专题元数据；书签按 collectionId 索引 |
| 工作量被低估 | 中 | 中 | 按 27 人日 + 20% buffer 排期；先交付 A/B/C，D 单独里程碑 |

---

## 八、明确不做（避免 scope creep）

- 点击统计、访问分析、短链跳转（issue 未要求，且需要事件表/重定向服务）；
- 自定义域名、独立部署、多租户；
- 多级专题/嵌套专题；
- 每个书签单独密码；
- 富文本个人主页、主题市场、拖拽式页面编辑器；
- 二维码上传与图片托管；
- 多人协作/权限角色细分（现有 `user | admin` 足够）。

---

## 九、待确认问题

1. **路由形态**：接受 `/c/social`，还是必须 `/social`？后者需要保留字与 rewrite 方案。
2. **密码粒度**：一个专题一个密码是否够？是否需要「同一专题多个密码/多个访客分组」？
3. **首页形态**：保持现在的全部书签聚合，还是希望首页变成「专题卡片入口」？
4. **社交卡片范围**：只做微信/QQ/电话/邮箱，还是还要点击统计、平台预设、二维码上传？
5. **用户空间**：这期是否只做公共空间？用户空间是否必须同步？
6. **二维码来源**：能否接受先填图片 URL（不做上传）？

---

## 附录 A：可直接回复 issue 的评论草稿

> 感谢关注这个 issue。这几个需求我整理了一下，建议拆成四块、按依赖顺序做，避免一次性改动过大：
>
> 1. **可选布局**：新增 `grid / list / compact` 三种卡片；`compact` 就是「单图标 + 短标题」，移动端可选 1/2/3 列，正好对应社交名片场景。这个不依赖其他模块，可以先做。
> 2. **社交卡片**：书签增加 `actionType`，支持 `link / wechat / qq / phone / email / custom`。微信点击弹二维码 + 复制微信号 + 唤起微信；QQ/电话/邮箱走对应深链，桌面端做网页回退。自媒体和订阅平台仍按普通链接处理。
> 3. **专题路由**：新增「专题（Collection）」实体，每个专题独立 slug（建议 `/c/xxx`）、独立布局和导航；书签归属单个专题，标签继续做横向分类。这样社交/工作可以真正隔离，也为密码提供边界。
> 4. **密码分类**：专题级密码，服务端校验 + HttpOnly 签名 Cookie。重点是搜索、随机、标签页、分页接口也要统一过滤，否则会从其他入口泄漏。
>
> 想确认几个取舍：
> - 路由用 `/c/social` 可以吗，还是希望顶层 `/social`？
> - 密码是「整个专题一个密码」就够，还是需要更细的粒度？
> - 是否接受先做公共空间，用户空间后续同步？
> - 二维码先填图片 URL（暂不做上传）是否可接受？

---

## 附录 B：一句话总结

**布局和社交卡片是「展示层扩展」，可以快速交付；专题是「数据边界」，密码是「安全边界」。先把专题模型定下来，再让布局和密码挂在专题上，最后用查询层过滤兜住密码，顺序反了就会返工。**
