# 知乎高质量回答搜索

个人自用的知乎搜索工具：输入问题 → 调用知乎开放平台 `zhihu_search` → 质量评分排序 → 展示精选回答摘要与原文链接。缓存优先保护每日 5000 次免费额度。

## 技术栈

Next.js 16（App Router）· TypeScript · Tailwind CSS · Neon Postgres · Vercel Cron

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入四个环境变量
npm run db:apply             # 建表
npm run dev                  # http://localhost:3000
```

访问时浏览器会弹 Basic Auth，用户名随意，密码 = `SITE_PASSWORD`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Neon 连接串 |
| `ZHIHU_ACCESS_TOKEN` | 知乎开放平台 Access Secret |
| `SITE_PASSWORD` | 全站 Basic Auth 密码 |
| `CRON_SECRET` | 每日清理接口的 Bearer 口令 |

## 常用脚本

```bash
npm test                  # vitest 单元测试
npm run db:apply          # 应用建表 SQL
npm run db:verify         # 校验四张表存在
npm run db:verify-store   # 对真实库跑一遍读写验证
```

## 部署 Vercel

1. 把仓库推到 GitHub/GitLab 并在 Vercel 导入
2. 项目 Settings → Environment Variables 配置上面 4 个变量
3. Deploy；部署后在项目 Crons 页确认 `/api/cron/daily`（每天 UTC 01:00 = 北京时间 09:00）
4. 访问站点，输入 Basic Auth 密码即可使用

## 额度与缓存

- 知乎 API 免费额度 5000 次/日；**相同关键词 24 小时内直接走 Neon 缓存，不消耗额度**
- 客户端限流每秒最多 1 次调用，防平台风控
- 质量门槛（赞同 ≥100、摘要 ≥30 字）在应用内过滤评分（知乎的 `SortBy` 参数与中文搜索组合有平台缺陷，恒返回空，已弃用）
- 缓存命中率、API 实际调用次数见站内「统计」页

## 已知限制

- 知乎搜索接口只返回**摘要**（`ContentText`），无全文接口；卡片展示摘要 + 原文链接
- 模块级限流器在 Vercel 多实例间不共享，个人用量下足够
- 每次搜索最多返回 10 条（平台 `Count` 上限），无分页
