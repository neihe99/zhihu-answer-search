'use client'
import type { RankedItem } from '@/lib/scoring'
import { FavoriteButton } from './FavoriteButton'

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
        <FavoriteButton item={item} />
      </div>
    </div>
  )
}
