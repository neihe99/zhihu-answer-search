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
