# 知乎高质量回答搜索 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建个人自用的知乎搜索应用：输入关键词 → 缓存优先 → 调用知乎开放平台 `zhihu_search` → 质量评分排序 → 展示摘要与原文链接，含收藏、热词统计、每日定时清理。

**Architecture:** Next.js 15 App Router 前后端一体，部署 Vercel；Neon Postgres 存缓存/日志/收藏；知乎 API 访问收敛在 `src/lib/zhihu/client.ts` 单文件；业务逻辑为可注入依赖的纯函数（service 层），API 路由只做请求/响应适配，UI 为客户端组件。

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, @neondatabase/serverless, vitest, Vercel Cron。

**Spec:** [docs/spec.md](../spec.md)

## Global Constraints

- 密钥只走环境变量：`DATABASE_URL`、`ZHIHU_ACCESS_TOKEN`、`SITE_PASSWORD`、`CRON_SECRET`（API base `https://developer.zhihu.com` 允许硬编码在 client.ts）
- Node ≥ 20；脚本用 `node --env-file=.env.local` 加载本地环境变量
- 知乎 API 免费额度 5000 次/日：**任何搜索必须先查缓存**；客户端限流 ≥ 1 次/秒
- 搜索请求带 `SortBy = "VoteUpCount:desc:(100,)"`，质量门槛下放服务端
- UI 文案中文；代码标识符英文
- 每个任务结束必须有一个独立可验证的交付物和一个 commit

## Review Focus

1. **空/纯空白搜索词** → service 抛 `EMPTY_QUERY`，路由返回 400 中文提示，不触碰 API（Task 8 测试）。
2. **知乎返回 `Code: 30001`（频率限制）或其他错误** → client 抛带错误码的 `ZhihuApiError`；service 降级返回过期缓存（`degraded: true`），无缓存才报错（Task 4、8 测试）。
3. **API 返回空 `Items`** → 返回空列表而非报错，且空结果也写缓存（防反复消耗额度）（Task 8 测试）。
4. **图片代理被当开放代理滥用**（传任意 URL）→ 仅放行 `https://*.zhimg.com`，其余 403（Task 11 测试）。
5. **`SITE_PASSWORD` 未配置** → 全站拒绝访问（fail closed），绝不放行（Task 1 测试）。

---

### Task 1: 项目脚手架 + Basic Auth

**Files:**
- Create: `package.json`（由 create-next-app 生成，追加 script）
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `src/lib/auth.ts`
- Create: `src/middleware.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `isAuthorized(authHeader: string | null, password: string | undefined): boolean`（Task 13 复用同文件加 cron 鉴权）

- [ ] **Step 1: 脚手架**

```bash
cd /e/git
npx create-next-app@latest zhihu-answer-search --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd /e/git/zhihu-answer-search
npm install @neondatabase/serverless
npm install -D vitest
```

- [ ] **Step 2: 配置 vitest 与测试脚本**

`vitest.config.ts`：

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node' },
})
```

`package.json` 的 `scripts` 追加：`"test": "vitest run"`

`.env.example`：

```
DATABASE_URL=
ZHIHU_ACCESS_TOKEN=
SITE_PASSWORD=
CRON_SECRET=
```

执行 `cp .env.example .env.local` 并填入本地值（不上传 git）。

- [ ] **Step 3: 写失败测试**

`tests/lib/auth.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { isAuthorized } from '@/lib/auth'

function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('isAuthorized', () => {
  it('接受正确密码', () => {
    expect(isAuthorized(basic('admin', 'secret123'), 'secret123')).toBe(true)
  })
  it('拒绝错误密码', () => {
    expect(isAuthorized(basic('admin', 'wrong'), 'secret123')).toBe(false)
  })
  it('拒绝缺失/非 Basic 的 header', () => {
    expect(isAuthorized(null, 'secret123')).toBe(false)
    expect(isAuthorized('Bearer abc', 'secret123')).toBe(false)
  })
  it('密码未配置时拒绝一切（fail closed）', () => {
    expect(isAuthorized(basic('admin', 'secret123'), undefined)).toBe(false)
    expect(isAuthorized(basic('admin', ''), '')).toBe(false)
  })
})
```

- [ ] **Step 4: 运行确认失败**

Run: `npm test`
Expected: FAIL（`@/lib/auth` 不存在）

- [ ] **Step 5: 实现**

`src/lib/auth.ts`：

```ts
export function isAuthorized(authHeader: string | null, password: string | undefined): boolean {
  if (!password) return false
  if (!authHeader?.startsWith('Basic ')) return false
  const decoded = atob(authHeader.slice('Basic '.length))
  const sep = decoded.indexOf(':')
  if (sep < 0) return false
  return decoded.slice(sep + 1) === password
}
```

`src/middleware.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'

export function middleware(req: NextRequest): NextResponse {
  if (!isAuthorized(req.headers.get('authorization'), process.env.SITE_PASSWORD)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="zhihu-search"' },
    })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: PASS（4 个用例）

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + vitest + basic auth middleware"
```

---

### Task 2: Neon 建表

**Files:**
- Create: `src/lib/schema.sql`
- Create: `scripts/apply-schema.mjs`
- Create: `scripts/verify-schema.mjs`
- Modify: `package.json`（追加 db scripts）

**Interfaces:**
- Consumes: `.env.local` 的 `DATABASE_URL`
- Produces: 四张表 `search_cache` / `answers` / `search_logs` / `favorites`（Task 7 的 store 层依赖这些表名与列名）

- [ ] **Step 1: 建表 SQL**

`src/lib/schema.sql`：

```sql
create table if not exists search_cache (
  query_hash text primary key,
  query text not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists answers (
  id text primary key,
  data jsonb not null,
  upvotes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists search_logs (
  id bigserial primary key,
  query text not null,
  cache_hit boolean not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists favorites (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_logs_created_at on search_logs (created_at);
create index if not exists idx_answers_created_at on answers (created_at);
```

- [ ] **Step 2: 应用与校验脚本**

`scripts/apply-schema.mjs`：

```js
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const ddl = readFileSync(new URL('../src/lib/schema.sql', import.meta.url), 'utf8')
await sql.query(ddl)
console.log('schema applied')
```

`scripts/verify-schema.mjs`：

```js
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const expected = ['answers', 'favorites', 'search_cache', 'search_logs']
const rows = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public'`
)
const actual = rows.map((r) => r.table_name)
const missing = expected.filter((t) => !actual.includes(t))
if (missing.length > 0) {
  console.error('缺少表:', missing)
  process.exit(1)
}
console.log('schema OK:', actual.join(', '))
```

`package.json` 的 `scripts` 追加：

```json
"db:apply": "node --env-file=.env.local scripts/apply-schema.mjs",
"db:verify": "node --env-file=.env.local scripts/verify-schema.mjs"
```

- [ ] **Step 3: 执行建表并校验**

Run: `npm run db:apply && npm run db:verify`
Expected: 输出 `schema OK: answers, favorites, search_cache, search_logs`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): neon schema for cache, answers, logs, favorites"
```

---

### Task 3: 查询归一化与哈希

**Files:**
- Create: `src/lib/query.ts`
- Test: `tests/lib/query.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `normalizeQuery(raw: string): string`、`isValidQuery(raw: string): boolean`、`queryHash(raw: string): string`（Task 8 service 使用）

- [ ] **Step 1: 写失败测试**

`tests/lib/query.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { isValidQuery, normalizeQuery, queryHash } from '@/lib/query'

describe('normalizeQuery', () => {
  it('去首尾空白、折叠内部空白、转小写', () => {
    expect(normalizeQuery('  RAG   评测 方法 ')).toBe('rag 评测 方法')
  })
  it('空串与纯空白归一化为空', () => {
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('isValidQuery', () => {
  it('非空查询有效', () => expect(isValidQuery('RAG')).toBe(true))
  it('纯空白无效', () => expect(isValidQuery('   ')).toBe(false))
})

describe('queryHash', () => {
  it('同一查询（忽略大小写空白）哈希相同', () => {
    expect(queryHash(' RAG 评测')).toBe(queryHash('rag 评测 '))
  })
  it('不同查询哈希不同', () => {
    expect(queryHash('rag')).not.toBe(queryHash('agent'))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/lib/query.ts`：

```ts
import { createHash } from 'node:crypto'

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isValidQuery(raw: string): boolean {
  return normalizeQuery(raw).length > 0
}

export function queryHash(raw: string): string {
  return createHash('sha256').update(normalizeQuery(raw)).digest('hex')
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: query normalization and hashing"
```

---

### Task 4: 知乎 API Client

**Files:**
- Create: `src/lib/zhihu/types.ts`
- Create: `src/lib/zhihu/client.ts`
- Test: `tests/lib/zhihu/client.test.ts`

**Interfaces:**
- Consumes: `ZHIHU_ACCESS_TOKEN`（注入，不直接读 env）
- Produces:
  - `SearchItem { id, contentType, title, excerpt, url, upvotes, comments, authorName, authorAvatar, authorBadgeText, editTime, rankingScore }`（Task 6 评分、Task 7 存储、Task 9 UI 使用）
  - `ZhihuApiError extends Error`（带 `code: number`，Task 8 降级逻辑依赖）
  - `createZhihuClient(token: string, fetchImpl?: typeof fetch): { search(query: string, opts?: { minUpvotes?: number }): Promise<SearchItem[]> }`

- [ ] **Step 1: 类型定义**

`src/lib/zhihu/types.ts`：

```ts
export interface SearchItem {
  id: string
  contentType: string
  title: string
  excerpt: string
  url: string
  upvotes: number
  comments: number
  authorName: string
  authorAvatar: string
  authorBadgeText: string
  editTime: number
  rankingScore: number
}
```

- [ ] **Step 2: 写失败测试**

`tests/lib/zhihu/client.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { createZhihuClient, ZhihuApiError } from '@/lib/zhihu/client'

const samplePayload = {
  Code: 0,
  Message: 'success',
  Data: {
    HasMore: false,
    SearchHashId: 'abc',
    Items: [
      {
        Title: 'RAG 评测方法综述',
        ContentType: 'Article',
        ContentID: '123',
        ContentText: '本文介绍主流 RAG 评测框架',
        Url: 'https://zhuanlan.zhihu.com/p/123',
        CommentCount: 15,
        VoteUpCount: 128,
        AuthorName: '张三',
        AuthorAvatar: 'https://picx.zhimg.com/a.jpg',
        AuthorBadgeText: '优秀答主',
        EditTime: 1710000000,
        RankingScore: 0.98,
      },
    ],
  },
}

function mockFetch(payload: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  }) as Response)
}

describe('createZhihuClient', () => {
  it('映射返回字段并带上鉴权头', async () => {
    const fetchImpl = mockFetch(samplePayload)
    const client = createZhihuClient('token-1', fetchImpl)
    const items = await client.search('rag')

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: '123',
      contentType: 'Article',
      title: 'RAG 评测方法综述',
      excerpt: '本文介绍主流 RAG 评测框架',
      upvotes: 128,
      comments: 15,
      authorName: '张三',
    })

    const [url, init] = fetchImpl.mock.calls[0]
    const u = new URL(url as string)
    expect(u.pathname).toBe('/api/v1/content/zhihu_search')
    expect(u.searchParams.get('Query')).toBe('rag')
    expect(u.searchParams.get('SortBy')).toBe('VoteUpCount:desc:(100,)')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-1')
    expect(Number(headers['X-Request-Timestamp'])).toBeGreaterThan(0)
  })

  it('minUpvotes=0 时不传 SortBy', async () => {
    const fetchImpl = mockFetch(samplePayload)
    await createZhihuClient('t', fetchImpl).search('rag', { minUpvotes: 0 })
    const [url] = fetchImpl.mock.calls[0]
    expect(new URL(url as string).searchParams.get('SortBy')).toBeNull()
  })

  it('Code !== 0 时抛 ZhihuApiError 并带错误码', async () => {
    const fetchImpl = mockFetch({ Code: 30001, Message: 'rate limited' })
    await expect(createZhihuClient('t', fetchImpl).search('rag')).rejects.toMatchObject({
      name: 'ZhihuApiError',
      code: 30001,
    })
  })

  it('HTTP 非 2xx 时抛 ZhihuApiError', async () => {
    const fetchImpl = mockFetch({}, false)
    await expect(createZhihuClient('t', fetchImpl).search('rag')).rejects.toBeInstanceOf(ZhihuApiError)
  })

  it('Items 缺失时返回空数组', async () => {
    const fetchImpl = mockFetch({ Code: 0, Data: { Items: null } })
    expect(await createZhihuClient('t', fetchImpl).search('rag')).toEqual([])
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

`src/lib/zhihu/client.ts`：

```ts
import type { SearchItem } from './types'

const API_BASE = 'https://developer.zhihu.com'
const SEARCH_PATH = '/api/v1/content/zhihu_search'

export class ZhihuApiError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message)
    this.name = 'ZhihuApiError'
  }
}

interface RawItem {
  Title?: string
  ContentType?: string
  ContentID?: string | number
  ContentText?: string
  Url?: string
  CommentCount?: number
  VoteUpCount?: number
  AuthorName?: string
  AuthorAvatar?: string
  AuthorBadgeText?: string
  EditTime?: number
  RankingScore?: number
}

function mapItem(r: RawItem): SearchItem {
  return {
    id: String(r.ContentID ?? ''),
    contentType: r.ContentType ?? 'Unknown',
    title: r.Title ?? '',
    excerpt: r.ContentText ?? '',
    url: r.Url ?? '',
    upvotes: r.VoteUpCount ?? 0,
    comments: r.CommentCount ?? 0,
    authorName: r.AuthorName ?? '',
    authorAvatar: r.AuthorAvatar ?? '',
    authorBadgeText: r.AuthorBadgeText ?? '',
    editTime: r.EditTime ?? 0,
    rankingScore: r.RankingScore ?? 0,
  }
}

export interface ZhihuClient {
  search(query: string, opts?: { minUpvotes?: number }): Promise<SearchItem[]>
}

export function createZhihuClient(token: string, fetchImpl: typeof fetch = fetch): ZhihuClient {
  return {
    async search(query, opts = {}) {
      const minUpvotes = opts.minUpvotes ?? 100
      const url = new URL(API_BASE + SEARCH_PATH)
      url.searchParams.set('Query', query)
      url.searchParams.set('Count', '10')
      if (minUpvotes > 0) {
        url.searchParams.set('SortBy', `VoteUpCount:desc:(${minUpvotes},)`)
      }

      const resp = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
          'Content-Type': 'application/json',
        },
      })
      if (!resp.ok) throw new ZhihuApiError(resp.status, `HTTP ${resp.status}`)

      const body = await resp.json()
      if (body.Code !== 0) {
        throw new ZhihuApiError(body.Code, body.Message ?? 'zhihu api error')
      }
      const items: RawItem[] = body.Data?.Items ?? []
      return items.map(mapItem)
    },
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: PASS（5 个用例）

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: zhihu search api client with auth, sortby and error codes"
```

---

### Task 5: 限流器

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `tests/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `createThrottler(minIntervalMs: number): () => Promise<void>`；`throttleZhihu`（1 秒间隔的全局单例，Task 9 路由注入 service）

- [ ] **Step 1: 写失败测试**

`tests/lib/rate-limit.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createThrottler } from '@/lib/rate-limit'

describe('createThrottler', () => {
  it('两次调用间隔不小于 minIntervalMs', async () => {
    const throttle = createThrottler(50)
    const start = Date.now()
    await throttle()
    await throttle()
    expect(Date.now() - start).toBeGreaterThanOrEqual(45)
  })
  it('首次调用不等待', async () => {
    const throttle = createThrottler(10_000)
    const start = Date.now()
    await throttle()
    expect(Date.now() - start).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/lib/rate-limit.ts`：

```ts
export function createThrottler(minIntervalMs: number): () => Promise<void> {
  let lastCallAt = 0
  return async function throttle(): Promise<void> {
    const now = Date.now()
    const wait = lastCallAt + minIntervalMs - now
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCallAt = Date.now()
  }
}

// 知乎 API 全局限流：每秒最多 1 次
export const throttleZhihu = createThrottler(1000)
```

> 注：模块级状态在 Vercel 多实例间不共享，个人用量下足够，见 README 说明。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rate throttler for zhihu api"
```

---

### Task 6: 质量过滤与评分

**Files:**
- Create: `src/lib/scoring.ts`
- Test: `tests/lib/scoring.test.ts`

**Interfaces:**
- Consumes: `SearchItem`（Task 4）
- Produces: `RankedItem extends SearchItem { score: number }`；`MIN_UPVOTES = 100`、`MIN_EXCERPT_LENGTH = 30`；`isHighQuality(item): boolean`；`scoreItem(item): number`；`rankItems(items: SearchItem[]): RankedItem[]`（Task 8 service 使用）

- [ ] **Step 1: 写失败测试**

`tests/lib/scoring.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { isHighQuality, rankItems, scoreItem } from '@/lib/scoring'
import type { SearchItem } from '@/lib/zhihu/types'

function item(overrides: Partial<SearchItem>): SearchItem {
  return {
    id: '1', contentType: 'Answer', title: 't', excerpt: '这是一段足够长度的回答摘要内容', url: '',
    upvotes: 100, comments: 10, authorName: 'a', authorAvatar: '', authorBadgeText: '',
    editTime: 0, rankingScore: 0,
    ...overrides,
  }
}

describe('isHighQuality', () => {
  it('赞同不足 100 过滤', () => {
    expect(isHighQuality(item({ upvotes: 99 }))).toBe(false)
  })
  it('摘要过短过滤', () => {
    expect(isHighQuality(item({ excerpt: '太短' }))).toBe(false)
  })
  it('达标通过', () => {
    expect(isHighQuality(item({}))).toBe(true)
  })
})

describe('scoreItem', () => {
  it('赞同 0.7 + 评论 0.3', () => {
    expect(scoreItem(item({ upvotes: 200, comments: 100 }))).toBe(170)
  })
})

describe('rankItems', () => {
  it('过滤低质并按分数降序', () => {
    const ranked = rankItems([
      item({ id: 'low', upvotes: 5 }),
      item({ id: 'b', upvotes: 150, comments: 0 }),
      item({ id: 'a', upvotes: 200, comments: 0 }),
    ])
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b'])
    expect(ranked[0].score).toBe(140)
  })
  it('空数组返回空数组', () => {
    expect(rankItems([])).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/lib/scoring.ts`：

```ts
import type { SearchItem } from '@/lib/zhihu/types'

export interface RankedItem extends SearchItem {
  score: number
}

export const MIN_UPVOTES = 100
export const MIN_EXCERPT_LENGTH = 30

export function isHighQuality(item: SearchItem): boolean {
  return item.upvotes >= MIN_UPVOTES && item.excerpt.trim().length >= MIN_EXCERPT_LENGTH
}

export function scoreItem(item: SearchItem): number {
  return item.upvotes * 0.7 + item.comments * 0.3
}

export function rankItems(items: SearchItem[]): RankedItem[] {
  return items
    .filter(isHighQuality)
    .map((it) => ({ ...it, score: scoreItem(it) }))
    .sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: quality filter and weighted scoring"
```

---

### Task 7: Store 数据访问层

**Files:**
- Create: `src/lib/store.ts`
- Create: `scripts/verify-store.mjs`
- Modify: `package.json`（追加 script）

**Interfaces:**
- Consumes: 四张表（Task 2）；`RankedItem`（Task 6）；`SearchItem`（Task 4）
- Produces（Task 8/9/10/12/13 依赖这些函数签名）：
  - `getCachedResults(queryHash: string, ttlHours?: number): Promise<RankedItem[] | null>`
  - `getStaleResults(queryHash: string): Promise<RankedItem[] | null>`
  - `saveSearchResults(query: string, queryHash: string, items: RankedItem[]): Promise<void>`
  - `logSearch(query: string, cacheHit: boolean, resultCount: number): Promise<void>`
  - `addFavorite(item: SearchItem): Promise<void>`
  - `listFavorites(): Promise<SearchItem[]>`
  - `removeFavorite(id: string): Promise<void>`
  - `getRecentQueries(limit?: number): Promise<string[]>`
  - `getHotWords(days?: number, limit?: number): Promise<{ query: string; count: number; cacheHits: number }[]>`
  - `getStatsSummary(days?: number): Promise<{ totalSearches: number; apiCalls: number; cacheHitRate: number }>`
  - `cleanupExpired(): Promise<{ cache: number; answers: number }>`

- [ ] **Step 1: 实现 store**

`src/lib/store.ts`：

```ts
import { neon } from '@neondatabase/serverless'
import type { RankedItem } from '@/lib/scoring'
import type { SearchItem } from '@/lib/zhihu/types'

type Sql = ReturnType<typeof neon>

let _sql: Sql | null = null
function getSql(): Sql {
  if (!_sql) _sql = neon(process.env.DATABASE_URL ?? '')
  return _sql
}

export async function getCachedResults(queryHash: string, ttlHours = 24): Promise<RankedItem[] | null> {
  const rows = await getSql().query(
    `select results from search_cache
     where query_hash = $1 and created_at > now() - make_interval(hours => $2)`,
    [queryHash, ttlHours]
  )
  return rows.length > 0 ? (rows[0].results as RankedItem[]) : null
}

export async function getStaleResults(queryHash: string): Promise<RankedItem[] | null> {
  const rows = await getSql().query('select results from search_cache where query_hash = $1', [queryHash])
  return rows.length > 0 ? (rows[0].results as RankedItem[]) : null
}

export async function saveSearchResults(query: string, queryHash: string, items: RankedItem[]): Promise<void> {
  const sql = getSql()
  await sql.query(
    `insert into search_cache (query_hash, query, results, created_at)
     values ($1, $2, $3, now())
     on conflict (query_hash) do update
       set query = $2, results = $3, created_at = now()`,
    [queryHash, query, JSON.stringify(items)]
  )
  for (const it of items) {
    await sql.query(
      `insert into answers (id, data, upvotes, created_at)
       values ($1, $2, $3, now())
       on conflict (id) do update set data = $2, upvotes = $3, created_at = now()`,
      [it.id, JSON.stringify(it), it.upvotes]
    )
  }
}

export async function logSearch(query: string, cacheHit: boolean, resultCount: number): Promise<void> {
  await getSql().query(
    'insert into search_logs (query, cache_hit, result_count) values ($1, $2, $3)',
    [query, cacheHit, resultCount]
  )
}

export async function addFavorite(item: SearchItem): Promise<void> {
  await getSql().query(
    'insert into favorites (id, data) values ($1, $2) on conflict (id) do nothing',
    [item.id, JSON.stringify(item)]
  )
}

export async function listFavorites(): Promise<SearchItem[]> {
  const rows = await getSql().query('select data from favorites order by created_at desc')
  return rows.map((r) => r.data as SearchItem)
}

export async function removeFavorite(id: string): Promise<void> {
  await getSql().query('delete from favorites where id = $1', [id])
}

export async function getRecentQueries(limit = 10): Promise<string[]> {
  const rows = await getSql().query(
    'select query from search_logs group by query order by max(created_at) desc limit $1',
    [limit]
  )
  return rows.map((r) => r.query as string)
}

export async function getHotWords(
  days = 30,
  limit = 50
): Promise<{ query: string; count: number; cacheHits: number }[]> {
  const rows = await getSql().query(
    `select query,
            count(*)::int as count,
            count(*) filter (where cache_hit)::int as "cacheHits"
     from search_logs
     where created_at > now() - make_interval(days => $1)
     group by query
     order by count desc
     limit $2`,
    [days, limit]
  )
  return rows as { query: string; count: number; cacheHits: number }[]
}

export async function getStatsSummary(days = 30): Promise<{ totalSearches: number; apiCalls: number; cacheHitRate: number }> {
  const rows = await getSql().query(
    `select count(*)::int as total,
            count(*) filter (where not cache_hit)::int as api
     from search_logs
     where created_at > now() - make_interval(days => $1)`,
    [days]
  )
  const total = rows[0].total as number
  const api = rows[0].api as number
  return { totalSearches: total, apiCalls: api, cacheHitRate: total > 0 ? 1 - api / total : 0 }
}

export async function cleanupExpired(): Promise<{ cache: number; answers: number }> {
  const sql = getSql()
  const [cacheRows] = await sql.query(
    `select count(*)::int as n from search_cache where created_at < now() - interval '24 hours'`
  )
  await sql.query(`delete from search_cache where created_at < now() - interval '24 hours'`)
  const [answerRows] = await sql.query(
    `select count(*)::int as n from answers a
     where a.created_at < now() - interval '7 days'
       and not exists (select 1 from favorites f where f.id = a.id)`
  )
  await sql.query(
    `delete from answers a
     where a.created_at < now() - interval '7 days'
       and not exists (select 1 from favorites f where f.id = a.id)`
  )
  return { cache: cacheRows.n as number, answers: answerRows.n as number }
}
```

- [ ] **Step 2: 写验证脚本（对真实 Neon 开发库跑一遍读写）**

`scripts/verify-store.mjs`：

```js
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const hash = 'testhash' + Date.now()

await sql.query(
  `insert into search_cache (query_hash, query, results) values ($1, 'verify query', '[]')`, [hash])
const hit = await sql.query(
  `select results from search_cache where query_hash = $1 and created_at > now() - interval '1 hour'`, [hash])
console.assert(hit.length === 1, '缓存写入/读取失败')

await sql.query(`insert into search_logs (query, cache_hit, result_count) values ('verify query', true, 0)`)
const logs = await sql.query(`select query from search_logs where query = 'verify query'`)
console.assert(logs.length >= 1, '日志写入失败')

await sql.query(`insert into favorites (id, data) values ('verify-id', '{}') on conflict (id) do nothing`)
await sql.query(`delete from favorites where id = 'verify-id'`)

const hot = await sql.query(
  `select query, count(*)::int as count from search_logs group by query order by count desc limit 5`)
console.log('hotWords OK:', hot.length > 0)

await sql.query(`delete from search_cache where query_hash = $1`, [hash])
await sql.query(`delete from search_logs where query = 'verify query'`)
console.log('store verification OK')
```

`package.json` 的 `scripts` 追加：`"db:verify-store": "node --env-file=.env.local scripts/verify-store.mjs"`

- [ ] **Step 3: 运行验证**

Run: `npm run db:verify-store`
Expected: 输出 `hotWords OK: true` 和 `store verification OK`，无 assertion 失败

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: neon store layer for cache, logs, favorites, stats, cleanup"
```

---

### Task 8: Search Service 编排

**Files:**
- Create: `src/lib/search-service.ts`
- Test: `tests/lib/search-service.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery`/`queryHash`/`isValidQuery`（Task 3）；`rankItems`/`RankedItem`（Task 6）；`SearchItem`（Task 4）
- Produces: `SearchResult { answers: RankedItem[]; fromCache: boolean; degraded: boolean }`；`SearchDeps`（见下）；`searchAnswers(deps: SearchDeps, rawQuery: string): Promise<SearchResult>`（Task 9 路由使用）

- [ ] **Step 1: 写失败测试**

`tests/lib/search-service.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { searchAnswers, type SearchDeps } from '@/lib/search-service'
import type { SearchItem } from '@/lib/zhihu/types'

function item(overrides: Partial<SearchItem> = {}): SearchItem {
  return {
    id: Math.random().toString(36).slice(2), contentType: 'Answer', title: 't',
    excerpt: '这是一段足够长度的回答摘要内容，用来通过质量过滤门槛',
    url: '', upvotes: 150, comments: 20, authorName: 'a', authorAvatar: '',
    authorBadgeText: '', editTime: 0, rankingScore: 0, ...overrides,
  }
}

function makeDeps(overrides: Partial<SearchDeps> = {}): SearchDeps & { mocks: Record<string, ReturnType<typeof vi.fn>> } {
  const mocks = {
    getCached: vi.fn(async () => null),
    getStale: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    log: vi.fn(async () => {}),
    fetchFromZhihu: vi.fn(async () => [item()]),
    throttle: vi.fn(async () => {}),
  }
  return { ...mocks, ...overrides, mocks }
}

describe('searchAnswers', () => {
  it('空查询抛 EMPTY_QUERY', async () => {
    await expect(searchAnswers(makeDeps(), '   ')).rejects.toThrow('EMPTY_QUERY')
  })

  it('缓存命中：不调用 API，记录 cache_hit', async () => {
    const d = makeDeps({ getCached: vi.fn(async () => [{ ...item(), score: 100 }]) })
    const r = await searchAnswers(d, 'rag')
    expect(r.fromCache).toBe(true)
    expect(d.mocks.fetchFromZhihu).not.toHaveBeenCalled()
    expect(d.mocks.log).toHaveBeenCalledWith('rag', true, 1)
  })

  it('未命中：限流 → 拉取 → 评分 → 存缓存与日志', async () => {
    const d = makeDeps()
    const r = await searchAnswers(d, 'RAG 评测')
    expect(d.mocks.throttle).toHaveBeenCalledBefore(d.mocks.fetchFromZhihu)
    expect(d.mocks.save).toHaveBeenCalledOnce()
    expect(d.mocks.log).toHaveBeenCalledWith('rag 评测', false, 1)
    expect(r.fromCache).toBe(false)
    expect(r.answers[0].score).toBeGreaterThan(0)
  })

  it('API 返回空 Items：返回空列表且仍写缓存', async () => {
    const d = makeDeps({ fetchFromZhihu: vi.fn(async () => []) })
    const r = await searchAnswers(d, 'rag')
    expect(r.answers).toEqual([])
    expect(d.mocks.save).toHaveBeenCalledOnce()
  })

  it('API 报错但有过期缓存：降级返回 degraded', async () => {
    const d = makeDeps({
      fetchFromZhihu: vi.fn(async () => { throw new Error('30001 rate limited') }),
      getStale: vi.fn(async () => [{ ...item(), score: 50 }]),
    })
    const r = await searchAnswers(d, 'rag')
    expect(r.degraded).toBe(true)
    expect(r.answers).toHaveLength(1)
  })

  it('API 报错且无缓存：原样抛出', async () => {
    const d = makeDeps({ fetchFromZhihu: vi.fn(async () => { throw new Error('boom') }) })
    await expect(searchAnswers(d, 'rag')).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/lib/search-service.ts`：

```ts
import { isValidQuery, normalizeQuery, queryHash } from '@/lib/query'
import { rankItems, type RankedItem } from '@/lib/scoring'
import type { SearchItem } from '@/lib/zhihu/types'

export interface SearchResult {
  answers: RankedItem[]
  fromCache: boolean
  degraded: boolean
}

export interface SearchDeps {
  getCached: (hash: string) => Promise<RankedItem[] | null>
  getStale: (hash: string) => Promise<RankedItem[] | null>
  save: (query: string, hash: string, items: RankedItem[]) => Promise<void>
  log: (query: string, cacheHit: boolean, resultCount: number) => Promise<void>
  fetchFromZhihu: (query: string) => Promise<SearchItem[]>
  throttle: () => Promise<void>
}

export async function searchAnswers(deps: SearchDeps, rawQuery: string): Promise<SearchResult> {
  if (!isValidQuery(rawQuery)) throw new Error('EMPTY_QUERY')

  const query = normalizeQuery(rawQuery)
  const hash = queryHash(rawQuery)

  const cached = await deps.getCached(hash)
  if (cached) {
    await deps.log(query, true, cached.length)
    return { answers: cached, fromCache: true, degraded: false }
  }

  try {
    await deps.throttle()
    const items = await deps.fetchFromZhihu(query)
    const ranked = rankItems(items)
    await deps.save(query, hash, ranked)
    await deps.log(query, false, ranked.length)
    return { answers: ranked, fromCache: false, degraded: false }
  } catch (err) {
    const stale = await deps.getStale(hash)
    if (stale) {
      await deps.log(query, false, stale.length)
      return { answers: stale, fromCache: true, degraded: true }
    }
    throw err
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: search service orchestration with cache, degrade, logging"
```

---

### Task 9: /api/search 路由 + 搜索页 UI

**Files:**
- Create: `src/app/api/search/route.ts`
- Create: `src/app/api/history/route.ts`
- Create: `src/app/page.tsx`
- Create: `src/components/SearchBox.tsx`
- Create: `src/components/AnswerCard.tsx`
- Create: `src/components/SearchResults.tsx`
- Modify: `src/app/layout.tsx`（导航）

**Interfaces:**
- Consumes: `searchAnswers`/`SearchDeps`（Task 8）；store 函数（Task 7）；`createZhihuClient`（Task 4）；`throttleZhihu`（Task 5）
- Produces: `GET /api/search?q=… → { answers, fromCache, degraded }`（错误时 `{ error }` + 400/502）；`GET /api/history → { queries: string[] }`

- [ ] **Step 1: API 路由**

`src/app/api/search/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createZhihuClient } from '@/lib/zhihu/client'
import { throttleZhihu } from '@/lib/rate-limit'
import { searchAnswers } from '@/lib/search-service'
import { getCachedResults, getStaleResults, logSearch, saveSearchResults } from '@/lib/store'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const result = await searchAnswers(
      {
        getCached: getCachedResults,
        getStale: getStaleResults,
        save: saveSearchResults,
        log: logSearch,
        fetchFromZhihu: (query) => createZhihuClient(process.env.ZHIHU_ACCESS_TOKEN!).search(query),
        throttle: throttleZhihu,
      },
      q
    )
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'EMPTY_QUERY') {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 })
    }
    console.error('[search] failed:', err)
    return NextResponse.json({ error: '搜索失败，请稍后重试' }, { status: 502 })
  }
}
```

`src/app/api/history/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getRecentQueries } from '@/lib/store'

export async function GET() {
  const queries = await getRecentQueries(10)
  return NextResponse.json({ queries })
}
```

- [ ] **Step 2: 前端组件**

`src/components/SearchBox.tsx`：

```tsx
'use client'
import { useState } from 'react'

export function SearchBox({ onSearch, loading }: { onSearch: (q: string) => void; loading: boolean }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => { e.preventDefault(); onSearch(value) }}
    >
      <input
        className="flex-1 rounded border px-3 py-2"
        placeholder="输入问题，如：怎么理解 RAG 的评测方法"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
        {loading ? '搜索中…' : '搜索'}
      </button>
    </form>
  )
}
```

`src/components/AnswerCard.tsx`：

```tsx
'use client'
import type { RankedItem } from '@/lib/scoring'

const TYPE_LABEL: Record<string, string> = {
  Answer: '回答', Article: '文章', Question: '问题',
}

function proxied(avatar: string): string {
  return avatar ? `/api/image?url=${encodeURIComponent(avatar)}` : ''
}

export function AnswerCard({ item }: { item: RankedItem }) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="rounded bg-gray-100 px-2 py-0.5">{TYPE_LABEL[item.contentType] ?? item.contentType}</span>
        <span>评分 {item.score.toFixed(1)}</span>
      </div>
      <h3 className="font-medium">{item.title}</h3>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {item.authorAvatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxied(item.authorAvatar)} alt="" className="h-6 w-6 rounded-full" />
        )}
        <span>{item.authorName}</span>
        {item.authorBadgeText && <span className="text-blue-600">· {item.authorBadgeText}</span>}
      </div>
      <p className="text-sm text-gray-700 line-clamp-4">{item.excerpt}</p>
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>▲ {item.upvotes}</span>
        <span>💬 {item.comments}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          查看原文 →
        </a>
      </div>
    </div>
  )
}
```

`src/components/SearchResults.tsx`：

```tsx
'use client'
import type { RankedItem } from '@/lib/scoring'
import { AnswerCard } from './AnswerCard'

export function SearchResults({ items }: { items: RankedItem[] }) {
  if (items.length === 0) return <p className="text-gray-500">没有符合条件的优质回答，换个说法试试。</p>
  return (
    <div className="space-y-3">
      {items.map((it) => <AnswerCard key={it.id} item={it} />)}
    </div>
  )
}
```

`src/app/page.tsx`：

```tsx
'use client'
import { useEffect, useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { SearchResults } from '@/components/SearchResults'
import type { RankedItem } from '@/lib/scoring'

export default function HomePage() {
  const [items, setItems] = useState<RankedItem[] | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetch('/api/history').then((r) => r.json()).then((d) => setHistory(d.queries ?? [])).catch(() => {})
  }, [])

  async function onSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setNotice('')
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? '搜索失败')
      setItems(data.answers)
      if (data.degraded) setNotice('知乎接口暂时不可用，以下为缓存结果')
      else if (data.fromCache) setNotice('（缓存结果，未消耗额度）')
    } catch (e) {
      setItems(null)
      setNotice(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <SearchBox onSearch={onSearch} loading={loading} />
      {notice && <p className="text-sm text-gray-500">{notice}</p>}
      {history.length > 0 && items === null && (
        <div className="flex flex-wrap gap-2 text-sm">
          {history.map((q) => (
            <button key={q} onClick={() => onSearch(q)} className="rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200">
              {q}
            </button>
          ))}
        </div>
      )}
      {items !== null && <SearchResults items={items} />}
    </main>
  )
}
```

`src/app/layout.tsx` 改为带导航（搜索 / 收藏 / 统计）的壳，保留 create-next-app 生成的 Tailwind 引入。

- [ ] **Step 3: 手动验证**

Run: `npm run dev`
依次验证：
1. 打开 `http://localhost:3000`，先弹 Basic Auth，输错密码 → 401；输对 → 进入
2. 搜索「RAG 评测」→ 出现结果卡片（标题/作者/赞同数/摘要/原文链接）
3. 同一词再搜一次 → 提示「缓存结果，未消耗额度」，响应明显更快
4. `npm run db:verify` 之外，可在 Neon SQL Editor 执行 `select * from search_logs order by id desc limit 5` 确认日志写入

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: search api route and search page ui"
```

---

### Task 10: 收藏

**Files:**
- Create: `src/app/api/favorites/route.ts`
- Create: `src/app/favorites/page.tsx`
- Create: `src/components/FavoriteButton.tsx`
- Modify: `src/components/AnswerCard.tsx`（加入收藏按钮）

**Interfaces:**
- Consumes: `addFavorite`/`listFavorites`/`removeFavorite`（Task 7）
- Produces: `GET /api/favorites → { items: SearchItem[] }`；`POST /api/favorites { item } → { ok }`；`DELETE /api/favorites { id } → { ok }`

- [ ] **Step 1: API 路由**

`src/app/api/favorites/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { addFavorite, listFavorites, removeFavorite } from '@/lib/store'

export async function GET() {
  const items = await listFavorites()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body?.item?.id) return NextResponse.json({ error: '缺少 item' }, { status: 400 })
  await addFavorite(body.item)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  await removeFavorite(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 按钮与页面**

`src/components/FavoriteButton.tsx`：

```tsx
'use client'
import { useState } from 'react'

export function FavoriteButton({ item }: { item: Record<string, unknown> }) {
  const [done, setDone] = useState(false)
  return (
    <button
      disabled={done}
      onClick={async () => {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        })
        setDone(true)
      }}
      className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
    >
      {done ? '已收藏' : '☆ 收藏'}
    </button>
  )
}
```

`src/app/favorites/page.tsx`：

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { SearchItem } from '@/lib/zhihu/types'

export default function FavoritesPage() {
  const [items, setItems] = useState<SearchItem[]>([])

  useEffect(() => {
    fetch('/api/favorites').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {})
  }, [])

  async function remove(id: string) {
    await fetch('/api/favorites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6">
      <h2 className="text-lg font-medium">我的收藏</h2>
      {items.length === 0 && <p className="text-gray-500">还没有收藏，去搜索页收藏几篇吧。</p>}
      {items.map((it) => (
        <div key={it.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              {it.title}
            </a>
            <p className="text-sm text-gray-600 line-clamp-2">{it.excerpt}</p>
            <p className="text-sm text-gray-500">{it.authorName} · ▲ {it.upvotes}</p>
          </div>
          <button onClick={() => remove(it.id)} className="text-sm text-red-500 hover:underline">删除</button>
        </div>
      ))}
    </main>
  )
}
```

`src/components/AnswerCard.tsx` 底部操作区加入 `<FavoriteButton item={item} />`（与「查看原文」并排）。

- [ ] **Step 3: 手动验证**

Run: `npm run dev`
1. 搜索结果点「收藏」→ 按钮变「已收藏」
2. 打开 /favorites → 出现该条；点「删除」→ 消失
3. Neon SQL Editor: `select * from favorites` 确认快照

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: favorites api and page"
```

---

### Task 11: 图片代理

**Files:**
- Create: `src/app/api/image/route.ts`
- Test: `tests/api/image.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `isAllowedImageUrl(raw: string): boolean`；`GET /api/image?url=<zhimg url> → 图片二进制`（非 zhimg → 403；上游失败 → 502）

- [ ] **Step 1: 写失败测试**

`tests/api/image.test.ts`：

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GET, isAllowedImageUrl } from '@/app/api/image/route'

describe('isAllowedImageUrl', () => {
  it('放行 https 的 zhimg.com 域名', () => {
    expect(isAllowedImageUrl('https://pic1.zhimg.com/v2-abc.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://picx.zhimg.com/a.png')).toBe(true)
  })
  it('拒绝非 zhimg 域名（防开放代理）', () => {
    expect(isAllowedImageUrl('https://example.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://zhimg.com.evil.com/x.jpg')).toBe(false)
  })
  it('拒绝非 https 与非法 URL', () => {
    expect(isAllowedImageUrl('http://pic1.zhimg.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('not-a-url')).toBe(false)
  })
})

describe('GET /api/image', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      body: 'fake-image-bytes',
    }) as unknown as Response))
  })
  afterEach(() => vi.unstubAllGlobals())

  async function callImage(url: string) {
    const req = new Request(`http://localhost/api/image?url=${encodeURIComponent(url)}`)
    return GET(new (class extends Request { nextUrl = new URL(req.url) })(req.url))
  }

  it('非 zhimg URL 返回 403，不回源', async () => {
    const resp = await callImage('https://example.com/x.jpg')
    expect(resp.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('合法 URL 回源并透传 content-type', async () => {
    const resp = await callImage('https://pic1.zhimg.com/v2-abc.jpg')
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toBe('image/jpeg')
    expect(fetch).toHaveBeenCalledOnce()
  })
})
```

> 注：若 NextRequest 在 node 测试环境下构造失败，把 route 改为接收 `Request` 并用 `new URL(req.url).searchParams` 取参——保持纯 Web API，不依赖 next/server 的扩展。

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/app/api/image/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST_SUFFIX = '.zhimg.com'
const UPSTREAM_REFERER = 'https://www.zhihu.com'

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname.endsWith(ALLOWED_HOST_SUFFIX)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') ?? ''
  if (!isAllowedImageUrl(url)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const upstream = await fetch(url, { headers: { Referer: UPSTREAM_REFERER } })
  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: 502 })
  }
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 手动验证（端到端）**

Run: `npm run dev`
搜索任意词，确认作者头像正常显示（不裂图）；开发者工具里 img 请求指向 `/api/image?url=...` 且 200。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: zhimg image proxy with host allowlist"
```

---

### Task 12: 统计页

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/app/stats/page.tsx`

**Interfaces:**
- Consumes: `getHotWords`/`getStatsSummary`（Task 7）
- Produces: `GET /api/stats → { hotWords: {query,count,cacheHits}[], summary: {totalSearches, apiCalls, cacheHitRate} }`

- [ ] **Step 1: API 路由**

`src/app/api/stats/route.ts`：

```ts
import { NextResponse } from 'next/server'
import { getHotWords, getStatsSummary } from '@/lib/store'

export async function GET() {
  const [hotWords, summary] = await Promise.all([getHotWords(30), getStatsSummary(30)])
  return NextResponse.json({ hotWords, summary })
}
```

- [ ] **Step 2: 页面**

`src/app/stats/page.tsx`：

```tsx
'use client'
import { useEffect, useState } from 'react'

interface HotWord { query: string; count: number; cacheHits: number }
interface Summary { totalSearches: number; apiCalls: number; cacheHitRate: number }

export default function StatsPage() {
  const [hotWords, setHotWords] = useState<HotWord[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then((d) => {
      setHotWords(d.hotWords ?? [])
      setSummary(d.summary ?? null)
    }).catch(() => {})
  }, [])

  const max = Math.max(1, ...hotWords.map((w) => w.count))

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h2 className="text-lg font-medium">搜索统计（近 30 天）</h2>
      {summary && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{summary.totalSearches}</p>
            <p className="text-sm text-gray-500">总搜索</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{summary.apiCalls}</p>
            <p className="text-sm text-gray-500">API 调用</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{(summary.cacheHitRate * 100).toFixed(0)}%</p>
            <p className="text-sm text-gray-500">缓存命中率</p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">热词榜</h3>
        {hotWords.length === 0 && <p className="text-gray-500">暂无数据</p>}
        {hotWords.map((w) => (
          <div key={w.query} className="flex items-center gap-2">
            <span className="w-40 truncate text-sm">{w.query}</span>
            <div className="h-4 rounded bg-blue-200" style={{ width: `${(w.count / max) * 100}%` }} />
            <span className="text-sm text-gray-500">{w.count} 次（省 {w.cacheHits} 次额度）</span>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 手动验证**

Run: `npm run dev`
1. 搜索 3~5 个不同关键词，重复其中 1 个两次
2. 打开 /stats → 三个汇总数字正确；热词榜按次数降序；缓存命中率 > 0

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: stats page with hot words and cache hit rate"
```

---

### Task 13: 每日清理 Cron

**Files:**
- Modify: `src/lib/auth.ts`（加 `isCronAuthorized`）
- Create: `src/app/api/cron/daily/route.ts`
- Test: `tests/lib/auth-cron.test.ts`

**Interfaces:**
- Consumes: `isAuthorized`（Task 1 模式）；`cleanupExpired`（Task 7）
- Produces: `isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean`；`GET /api/cron/daily`（校验 `Authorization: Bearer $CRON_SECRET` → 执行清理并返回删除数量）

- [ ] **Step 1: 写失败测试**

`tests/lib/auth-cron.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/lib/auth'

describe('isCronAuthorized', () => {
  it('Bearer 与 secret 匹配才通过', () => {
    expect(isCronAuthorized('Bearer abc123', 'abc123')).toBe(true)
    expect(isCronAuthorized('Bearer wrong', 'abc123')).toBe(false)
  })
  it('缺失/不匹配一律拒绝，secret 未配置时拒绝一切', () => {
    expect(isCronAuthorized(null, 'abc123')).toBe(false)
    expect(isCronAuthorized('Bearer abc123', undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL（函数不存在）

- [ ] **Step 3: 实现**

`src/lib/auth.ts` 追加：

```ts
export function isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
```

`src/app/api/cron/daily/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth'
import { cleanupExpired } from '@/lib/store'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const deleted = await cleanupExpired()
  return NextResponse.json({ ok: true, deleted })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 手动验证**

Run:
```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
curl -i http://localhost:3000/api/cron/daily
```
Expected: 第一条返回 `{"ok":true,"deleted":{...}}`；第二条 401。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: daily cron cleanup endpoint"
```

---

### Task 14: vercel.json + README + 构建验证

**Files:**
- Create: `vercel.json`
- Create: `README.md`

**Interfaces:**
- Consumes: 全部
- Produces: 可部署的 Vercel 项目

- [ ] **Step 1: Cron 配置**

`vercel.json`：

```json
{
  "crons": [{ "path": "/api/cron/daily", "schedule": "0 1 * * *" }]
}
```

> 注：Hobby 版仅支持每日一次的 crons，生产部署后自动生效。

- [ ] **Step 2: README**

`README.md` 内容包括：项目简介、本地开发步骤（clone / `.env.local` / `npm run db:apply` / `npm run dev`）、环境变量表、部署 Vercel 步骤（导入仓库 → 配置 4 个环境变量 → Deploy → 确认 Cron 出现在项目 Crons 页）、额度说明（5000/日，缓存优先，命中率可在 /stats 查看）、已知限制（多实例下限流器不互斥；接口仅返回摘要，无全文）。

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，无类型错误。

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: vercel cron config and readme"
```

---

## Self-Review 记录

- **Spec 覆盖**：缓存 24h（Task 2/7）、降级策略（Task 8）、评分权重 0.7/0.3（Task 6）、SortBy 下放（Task 4）、图片代理白名单（Task 11）、Basic Auth（Task 1）、收藏（Task 10）、热词榜（Task 12）、每日清理（Task 13）、5000 额度保护（Task 3/5/8 缓存+限流链路）。「不做」清单无一需要任务。
- **Review Focus 五条**均已挂到对应任务的测试。
- **类型一致性**：`SearchItem` 字段名在 Task 4 定义，Task 6/7/9/10 一致使用；`RankedItem` 在 Task 6 定义，Task 7/8/9 一致；store 函数签名在 Task 7 定义，Task 8/9/10/12/13 注入一致。
