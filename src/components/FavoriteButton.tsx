'use client'
import { useState } from 'react'
import type { SearchItem } from '@/lib/zhihu/types'

export function FavoriteButton({ item }: { item: SearchItem }) {
  const [done, setDone] = useState(false)
  return (
    <button
      disabled={done}
      onClick={async () => {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        })
        setDone(true)
      }}
      className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
    >
      {done ? '已收藏' : '☆ 收藏'}
    </button>
  )
}
