'use client'
import { useEffect, useState } from 'react'
import type { SearchItem } from '@/lib/zhihu/types'

export default function FavoritesPage() {
  const [items, setItems] = useState<SearchItem[]>([])

  useEffect(() => {
    fetch('/api/favorites').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {})
  }, [])

  async function remove(id: string) {
    await fetch('/api/favorites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6">
      <h2 className="text-lg font-medium">我的收藏</h2>
      {items.length === 0 && <p className="text-gray-500">还没有收藏，去搜索页收藏几篇吧。</p>}
      {items.map((it) => (
        <div key={it.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
              {it.title}
            </a>
            <p className="text-sm text-gray-600 line-clamp-2">{it.excerpt}</p>
            <p className="text-sm text-gray-500">{it.authorName} · ▲ {it.upvotes}</p>
          </div>
          <button onClick={() => remove(it.id)} className="text-sm text-red-500 hover:underline">删除</button>
        </div>
      ))}
    </main>
  )
}
