import { neon } from '@neondatabase/serverless'
import type { RankedItem } from '@/lib/scoring'
import type { SearchItem } from '@/lib/zhihu/types'

type Sql = ReturnType<typeof neon>
type Row = Record<string, unknown>

let _sql: Sql | null = null
function getSql(): Sql {
  if (!_sql) _sql = neon(process.env.DATABASE_URL ?? '')
  return _sql
}

async function queryRows(text: string, params: unknown[] = []): Promise<Row[]> {
  return (await getSql().query(text, params as never[])) as Row[]
}

export async function getCachedResults(queryHash: string, ttlHours = 24): Promise<RankedItem[] | null> {
  const rows = await queryRows(
    `select results from search_cache
     where query_hash = $1 and created_at > now() - make_interval(hours => $2)`,
    [queryHash, ttlHours]
  )
  return rows.length > 0 ? (rows[0].results as RankedItem[]) : null
}

export async function getStaleResults(queryHash: string): Promise<RankedItem[] | null> {
  const rows = await queryRows('select results from search_cache where query_hash = $1', [queryHash])
  return rows.length > 0 ? (rows[0].results as RankedItem[]) : null
}

export async function saveSearchResults(query: string, queryHash: string, items: RankedItem[]): Promise<void> {
    await queryRows(
    `insert into search_cache (query_hash, query, results, created_at)
     values ($1, $2, $3, now())
     on conflict (query_hash) do update
       set query = $2, results = $3, created_at = now()`,
    [queryHash, query, JSON.stringify(items)]
  )
  for (const it of items) {
    await queryRows(
      `insert into answers (id, data, upvotes, created_at)
       values ($1, $2, $3, now())
       on conflict (id) do update set data = $2, upvotes = $3, created_at = now()`,
      [it.id, JSON.stringify(it), it.upvotes]
    )
  }
}

export async function logSearch(query: string, cacheHit: boolean, resultCount: number): Promise<void> {
  await queryRows(
    'insert into search_logs (query, cache_hit, result_count) values ($1, $2, $3)',
    [query, cacheHit, resultCount]
  )
}

export async function addFavorite(item: SearchItem): Promise<void> {
  await queryRows(
    'insert into favorites (id, data) values ($1, $2) on conflict (id) do nothing',
    [item.id, JSON.stringify(item)]
  )
}

export async function listFavorites(): Promise<SearchItem[]> {
  const rows = await queryRows('select data from favorites order by created_at desc')
  return rows.map((r) => r.data as SearchItem)
}

export async function removeFavorite(id: string): Promise<void> {
  await queryRows('delete from favorites where id = $1', [id])
}

export async function getRecentQueries(limit = 10): Promise<string[]> {
  const rows = await queryRows(
    'select query from search_logs group by query order by max(created_at) desc limit $1',
    [limit]
  )
  return rows.map((r) => r.query as string)
}

export async function getHotWords(
  days = 30,
  limit = 50
): Promise<{ query: string; count: number; cacheHits: number }[]> {
  const rows = await queryRows(
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

export async function getStatsSummary(
  days = 30
): Promise<{ totalSearches: number; apiCalls: number; cacheHitRate: number }> {
  const rows = await queryRows(
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
    const [cacheRows] = await queryRows(
    `select count(*)::int as n from search_cache where created_at < now() - interval '24 hours'`
  )
  await queryRows(`delete from search_cache where created_at < now() - interval '24 hours'`)
  const [answerRows] = await queryRows(
    `select count(*)::int as n from answers a
     where a.created_at < now() - interval '7 days'
       and not exists (select 1 from favorites f where f.id = a.id)`
  )
  await queryRows(
    `delete from answers a
     where a.created_at < now() - interval '7 days'
       and not exists (select 1 from favorites f where f.id = a.id)`
  )
  return { cache: cacheRows.n as number, answers: answerRows.n as number }
}
