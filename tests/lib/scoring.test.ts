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
