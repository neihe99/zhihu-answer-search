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
