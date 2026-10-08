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
