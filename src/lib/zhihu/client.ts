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
  search(query: string): Promise<SearchItem[]>
}

export function createZhihuClient(token: string, fetchImpl: typeof fetch = fetch): ZhihuClient {
  return {
    async search(query) {
      const url = new URL(API_BASE + SEARCH_PATH)
      url.searchParams.set('Query', query)
      url.searchParams.set('Count', '10')
      // 不发送 SortBy：平台缺陷——SortBy 与非 ASCII Query 组合恒返回空（无相关内容）。
      // 质量门槛（赞同 ≥100）由 rankItems 在客户端兜底过滤。

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
