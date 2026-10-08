# 知乎高质量回答搜索 — 设计 Spec

> 基于知乎开放平台 `zhihu_search` 接口真实文档（见下）修订。

## 产品定位

个人自用的搜索应用：输入问题 → 调用知乎开放平台 `zhihu_search` → 按质量评分筛选排序 → 展示精选回答摘要 + 原文链接。

## 外部依赖：知乎开放平台

- 接口：`GET https://developer.zhihu.com/api/v1/content/zhihu_search`
- Header：
  - `Authorization: Bearer <ZHIHU_ACCESS_TOKEN>`
  - `X-Request-Timestamp: <秒级 Unix 时间戳>`
  - `Content-Type: application/json`
- Query：
  - `Query`（必填，关键词）
  - `Count`（默认 10，**最大 10**，超出截断）
  - `SortBy`（如 `VoteUpCount:desc:(100,)` = 赞同数 ≥100 后降序；**质量门槛下放服务端**）
- 响应 `Data.Items[]`（混合内容类型，最多 10 条，`HasMore` 恒 false，无分页）：
  `Title / ContentType / ContentID / ContentText(纯文本摘要) / Url / CommentCount / VoteUpCount / AuthorName / AuthorAvatar / AuthorBadgeText / EditTime / RankingScore / AuthorityLevel`
- 错误码：`Code !== 0` 即为失败；`10001` 参数错误 / `20001` 鉴权失败 / `30001` 频率限制 / `90001` 内部错误
- 免费额度 5000 次/日 → 缓存优先是硬约束
- 客户端限流 ≥ 1 次/秒，防风控

### ⚠️ 接口能力边界（设计据此收敛）

- **`ContentText` 是摘要而非全文**；文档无回答详情接口 → **不做「展开全文」，卡片展示摘要 + 原文链接**
- **响应无收藏数、无话题标签** → 评分只用赞同数/评论数；**「话题分布」统计取消**，统计只留热词榜
- 摘要为纯文本 → 前端纯文本渲染，**无 HTML 消毒需求**

## 技术栈

- Next.js 15（App Router）+ TypeScript strict + Tailwind CSS，部署 Vercel
- Neon（PostgreSQL）+ `@neondatabase/serverless`
- vitest 单元测试（纯逻辑层）
- Vercel Cron（Hobby 版每日一次）

## 全局约束

- 所有密钥/配置走环境变量：`DATABASE_URL`、`ZHIHU_ACCESS_TOKEN`、`SITE_PASSWORD`、`CRON_SECRET`，禁止硬编码（API base URL 固定为 `https://developer.zhihu.com`，允许出现在 client.ts 中）
- Node ≥ 20
- UI 为中文；代码标识符为英文

## 核心流程

```
用户输入关键词 → normalizeQuery（trim/小写/空白折叠）→ queryHash(sha256)
  → 查 search_cache（24h TTL，命中即返回，记日志 cache_hit=true）
  → 未命中：限流(≥1s) → 调 zhihu_search（SortBy=VoteUpCount:desc:(100,)）
  → rankAnswers（客户端兜底过滤 + 评分 + 排序）
  → 写缓存 + upsert answers + 记日志 → 返回
  → 知乎 API 报错（Code 30001 等）：降级返回过期缓存（degraded=true），没有再报错
```

## 质量评分（规则版）

- 服务端过滤：`SortBy = "VoteUpCount:desc:(100,)"`（赞同 ≥100）
- 客户端兜底过滤：`upvotes ≥ 100`（防参数失效）且 `摘要长度 ≥ 30` 字符
- 评分：`score = upvotes × 0.7 + comments × 0.3`，降序

## 数据模型（Neon）

| 表 | 字段 | 说明 |
|---|---|---|
| `search_cache` | query_hash(PK), query, results(jsonb), created_at | 搜索结果缓存，TTL 24h |
| `answers` | id(PK=ContentID), data(jsonb), upvotes, created_at | 内容快照，TTL 7d |
| `search_logs` | id, query, cache_hit, result_count, created_at | 每次搜索日志（含缓存命中），支撑热词榜 |
| `favorites` | id(PK=ContentID), data(jsonb), created_at | 收藏快照 |

注：个人用量下 search_logs 数据量极小，**不做日志归档/分表**（YAGNI）。

## 展示

- 结果卡片：内容类型徽章（回答/文章/问题）、标题、作者（含认证文案）、赞同/评论数、评分、摘要（纯文本）、原文链接
- 作者头像走 `/api/image` 代理（zhimg.com 防盗链）
- 收藏按钮 → POST 快照到 `favorites`

## 页面

1. **搜索页**（首页）：搜索框 + 历史关键词 + 结果列表（AnswerCard）
2. **收藏页**：收藏列表，可删除
3. **统计页**：热词榜（近 30 天 search_logs 聚合，含缓存命中率）

## 访问控制

Next.js Middleware Basic Auth：全站（静态资源除外）要求 Basic Auth，密码 = `SITE_PASSWORD`。个人自用，不做用户系统。

## 定时任务

每天凌晨 1 点（Vercel Cron → `GET /api/cron/daily`，校验 `Authorization: Bearer $CRON_SECRET`）：
1. 删除过期 search_cache（>24h）
2. 删除过期 answers（>7d 且未被收藏——收藏是独立快照，删 answers 不影响收藏）

## 图片代理

`GET /api/image?url=`：仅允许 `https://*.zhimg.com`，带 `Referer: https://www.zhihu.com` 回源，缓存 24h。防开放代理滥用。

## 明确不做（YAGNI）

- 用户系统 / OAuth
- AI 打分/总结（第二阶段）
- 「展开全文」（接口无全文）
- 话题分布统计（接口无 topic 字段）
- 日志归档、分表
- 图表库（统计页用 Tailwind 条形即可）
