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
