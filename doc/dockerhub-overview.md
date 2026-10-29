# BMM

[![BMM 界面](https://raw.githubusercontent.com/leonz973/bmm/main/doc/images/screenshot-pc-light-dark.png)](https://bmm.lccl.cc/)

收纳、整理、搜索与分享网站书签的开源全栈应用，基于 Next.js 16 + Drizzle ORM，支持公共首页、个人空间、管理后台，以及 AI 辅助的网站解析与标签推荐。

- 在线体验：https://bmm.lccl.cc/
- 源码与文档：https://github.com/leonz973/bmm
- 许可证：MIT（Fork 自 [Y80/bmm](https://github.com/Y80/bmm)）

## 快速开始

```bash
docker pull leonz973/bmm:latest

docker run -d --name bmm \
  -p 3100:3100 \
  -e DB_DRIVER=sqlite \
  -e DB_CONNECTION_URL=file:/app/volume/sqlite.db \
  -v bmm:/app/volume \
  leonz973/bmm:latest
```

启动后访问 `http://localhost:3100`，首个注册的用户自动成为管理员。

### 数据与配置

- SQLite 数据文件在卷 `bmm` 的 `/app/volume/sqlite.db`，删除或升级容器都不会丢数据
- 生产环境建议把环境变量写进卷内的 `/app/volume/.env`（容器启动时自动加载），至少配置 `AUTH_URL`、`AUTH_SECRET`
- 使用 PostgreSQL 时改为 `-e DB_DRIVER=postgresql -e DB_CONNECTION_URL=postgresql://user:pass@host:5432/bmm`

### 镜像标签

| 标签                | 说明                          |
| ------------------- | ----------------------------- |
| `latest`、`1.0`     | 最新稳定版本                  |
| `1.0.<构建号>`      | 每次构建递增的版本号          |
| `<commit-sha>`      | 对应提交的完整 SHA            |

当前构建平台为 `linux/amd64`。镜像同时发布在 GitHub Container Registry：`ghcr.io/leonz973/bmm`，可任选其一拉取。

## 功能

- 书签增删改查、标签整理与图标抓取，公共首页与个人空间分开展示
- 个人书签可申请公开，管理员在后台审核、维护公共数据
- AI 网站解析，自动生成标题、描述与标签（模型供应商在后台配置）
- 移动端适配，列表 / 双列 / 三列三种展示偏好
- 应用锁（九宫格或数字 PIN）与书签分享口令
