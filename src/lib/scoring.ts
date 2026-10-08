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
