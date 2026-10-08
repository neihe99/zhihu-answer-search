import { describe, expect, it, vi } from 'vitest'
import { searchAnswers, type SearchDeps } from '@/lib/search-service'
import type { SearchItem } from '@/lib/zhihu/types'

function item(overrides: Partial<SearchItem> = {}): SearchItem {
  return {
    id: Math.random().toString(36).slice(2), contentType: 'Answer', title: 't',
    excerpt: '这是一段足够长度的回答摘要内容，用来通过质量过滤门槛，确保达标',
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
    expect(d.mocks.log).toHaveBeenCalledWith('RAG 评测', false, 1)
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
