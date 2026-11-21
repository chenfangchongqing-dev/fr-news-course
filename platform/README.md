# 汉法新闻编译数智教学平台 V1.0

Plateforme pédagogique de traduction journalistique chinois-français

数智赋能贯穿课程资源检索、新闻编译学习、跨媒体比较、项目协作和过程性评价。

## 运行与验收

Vinext + Cloudflare D1 + R2，Sites 私有身份网关。原 GitHub 仓库只读导入，未修改。源码在独立 Sites 仓库保存。

- `npx tsc --noEmit` 类型检查。
- `node tests/integration.mjs` D1/R2隔离集成测试，不写线上测试学生记录。
- 数据库 schema 在 db/schema.ts，迁移在 drizzle。
- 构建、预览与发布遵循 Sites 标准辅助脚本。

所有者通过已核定邮箱绑定稳定用户 ID；其他身份须教师邀请。角色和项目成员在服务端逐项校验。站点保持 owner-private。正式学生访问前，须完成真实双账号登录、项目隔离、文件访问和教师评价验收。

## 功能状态

| 模块 | V1.0 |
|---|---|
| 汉法资源 | 原库165条资源，组合筛选、双栏例句、来源与核验、任务关联 |
| 科研文献 | Crossref/HAL真实API；OpenAlex实际错误显示；OpenEdition DOI核验；收藏、标签、审核、RIS/BibTeX |
| TMS | 项目、任务、分配、版本、附件、三审三校、LQA、交付、授权归档、工作量记录 |
| 新闻比较 | 280条原库候选快照；France24 RSS；来源目录、手动收录、选取比较、证据标注 |
| 教学评价 | 任务状态、稿件与反思、教师评分和反馈、JSON导出 |
| 教学AI | 4模式、固定教师支架、学习问题保存；模型待接入，无伪造回复 |

欧时网、Chine-info.com提供原站入口与手动收录。自动抓取和同事件匹配待接入。Zotero API待授权。AI自动标注、阅读笔记、综述待模型接入。无真实客户资料，未接微信或飞书客户台账。

原始数据与字段在data/legacy保留，新闻只存公开元数据，不采集受限全文。旧核验标注沿用原库并标明来源；新质生产力的中国翻译协会术语于2026-11-21重新读取原文核验。

## 私有站点研究更新

依赖 Sites owner-private 平台访问边界。更改为公开站点前必须为服务端更新接口新增服务认证，不能为了调度扩大受众。

1. 云任务用 Sites get_site 获取当前 origin、访问策略与支持的服务凭据。凭据只保留内存，不写日志、文件、源码或任务提示。
2. 仅向本 Site 发送 OAI-Sites-Authorization 标头。
3. 每日 POST `/api/refresh`，JSON空对象。读取已保存主题，检索 Crossref/HAL，按DOI或规范化题名去重，保存候选及实际来源状态。无保存主题时检索 journalistic translation framing。
4. GET `/api/update-status` 回读各源状态与候选总数。上游429等错误明确记录，留待下次运行。
5. 每周 POST `/api/weekly-summary`，JSON空对象。将近7天新增题名、作者、年份、DOI与原始链接写入研究动态。只依据书目元数据，不生成研究结论。
6. 日常更新不需重新发布；候选不得自动变为教师正式推荐。

## 验收限制

集成测试采用隔离数据库、测试身份头与虚构材料；真实学生多账号及校园网络待后续验收。来源可能限流、过期或失效，界面呈现实际请求结果。记录在服务端持久保存，浏览器仅存当前编辑与筛选状态。

## 汉法资源数据库升级（2026-11-21）

语料查询改为 D1 参数化查询，前端不再把原库 JSON 当作搜索后端。保留165条原库，新增12条逐项核对的术语与政策句段；原始字段、SHA-256、发布文献、页码/词条编号、核验历史和导入批次均可追溯。细节见 docs/CORPUS-ACCEPTANCE.md。

- `GET /api/corpus/search?q=...&type=all&status=&theme=&publisher=&from=&to=&page=1`：服务器组合检索，每页20条，支持中文及去重音法文。
- `GET /api/corpus/:id`：展示字段、不可变原记录、来源和核验历史。
- `PATCH /api/corpus/:id`：已认证教师提交核验；必须有依据、URL、位置和当前版本；并发冲突返回409。
- `POST /api/corpus-import`：所有者私有网关内的固定公共来源清单导入，只能新增，不接收任意数据，不覆盖旧记录。
- `GET /api/corpus/stats`：真实数据库数量及导入批次。

本地预览先按顺序应用新迁移，再执行 `node scripts/seed-preview-corpus.mjs`。生产必须先保存测试版本并验收，随后部署结构迁移，最后由所有者私有服务权限执行固定导入。不要重新执行已应用的建表迁移，不要把生产数据库当作测试库。来源连通性并非自动定时复查；全网实时语料发现尚待接入。
