# Sites v3 → fr-news-course (迁移工作区)

此目录从用户提供的 Sites v3 源代码导出包迁入，源提交 `ca2d8ddc6577fc3d5f67e7e6836aff83c9331de8`。与旧课程网站（仓库根目录）分离；本目录不是 GitHub Pages 可直接运行的纯静态站点。

## 保留与适配

- 保留六大模块、组件、Vinext / Cloudflare Workers API、D1/R2 数据模型、Drizzle 迁移与原始教学资源种子。
- 原站项目标识改为占位符；教师邮箱改从 Cloudflare 私有绑定 `OWNER_EMAIL` 读取；隔离集成测试使用 `test-owner@example.test`。
- 原站配置摘要、导出清单和平台调度信息未提交到公开仓库，私有数据库快照单独保存。
- 已有 500 组联合国汉法句级对齐样本位于 `data/un/UNv1_zhfr_pilot_500_with_schema.sql`（单独表），尚未写入生产库。

## 安全封锁（重要）

**本分支是源码迁移存档，不允许未经改造直接对外部署。** 源 API 目前通过 Sites 私有身份网关注入 `oai-authenticated-user-*` 请求头。独立 Cloudflare Workers 不能信任浏览器发送的这些头，必须先实现身份令牌的服务端验证及头部清理，并对 `/api/refresh`、`/api/weekly-summary`、`/api/corpus-import` 进行独立授权；同时要提供真正的访问权限控制、R2 文件权限测试以及 D1 隔离测试。

开发命令应在此目录执行，所需 Node.js >=22.13、npm：

```sh
npm ci
npm run build
npx tsc --noEmit
node tests/corpus.mjs
node tests/integration.mjs
```

本地需另外初始化独立的 D1 数据库。现阶段 `OWNER_EMAIL` 仅是配置参数，不能代替可信身份验证。数据库迁移请只在**新建的空库**上执行，不可对原 Sites 业务库运行。

## 数据

源 JSON 中 `data/corpus.json` 为 165 条原始课程资源；`data/news.json` 为 280 条新华社法语报道候选元数据；`data/corpus-import/authority-v1.json` 为 177 条课程资源的固定入库清单。源数据库导出为 8 张表、303 条记录，**因包含成员、项目、教学评价及其他潜在私人业务数据，不放入公开 GitHub**；仅在受控的新 D1 数据库恢复。新的独立身份系统需要核对成员主键映射。

原仓库主分支 `main` 与备份分支 `backup/pre-sites-migration-2026-11-21` 均保留。只有审查通过后才考虑合并迁移分支。
