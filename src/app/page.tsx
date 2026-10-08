'use client'
import { useEffect, useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { SearchResults } from '@/components/SearchResults'
import type { RankedItem } from '@/lib/scoring'

export default function HomePage() {
  const [items, setItems] = useState<RankedItem[] | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetch('/api/history').then((r) => r.json()).then((d) => setHistory(d.queries ?? [])).catch(() => {})
  }, [])

  async function onSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setNotice('')
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? '搜索失败')
      setItems(data.answers)
      if (data.degraded) setNotice('知乎接口暂时不可用，以下为缓存结果')
      else if (data.fromCache) setNotice('（缓存结果，未消耗额度）')
    } catch (e) {
      setItems(null)
      setNotice(e instanceof Error ? e.message : '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <SearchBox onSearch={onSearch} loading={loading} />
      {notice && <p className="text-sm text-gray-500">{notice}</p>}
      {history.length > 0 && items === null && (
        <div className="flex flex-wrap gap-2 text-sm">
          {history.map((q) => (
            <button key={q} onClick={() => onSearch(q)} className="rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200">
              {q}
            </button>
          ))}
        </div>
      )}
      {items !== null && <SearchResults items={items} />}
    </main>
  )
}
