'use client'
import { useEffect, useState } from 'react'

interface HotWord { query: string; count: number; cacheHits: number }
interface Summary { totalSearches: number; apiCalls: number; cacheHitRate: number }

export default function StatsPage() {
  const [hotWords, setHotWords] = useState<HotWord[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then((d) => {
      setHotWords(d.hotWords ?? [])
      setSummary(d.summary ?? null)
    }).catch(() => {})
  }, [])

  const max = Math.max(1, ...hotWords.map((w) => w.count))

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h2 className="text-lg font-medium">搜索统计（近 30 天）</h2>
      {summary && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{summary.totalSearches}</p>
            <p className="text-sm text-gray-500">总搜索</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{summary.apiCalls}</p>
            <p className="text-sm text-gray-500">API 调用</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{(summary.cacheHitRate * 100).toFixed(0)}%</p>
            <p className="text-sm text-gray-500">缓存命中率</p>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">热词榜</h3>
        {hotWords.length === 0 && <p className="text-gray-500">暂无数据</p>}
        {hotWords.map((w) => (
          <div key={w.query} className="flex items-center gap-2">
            <span className="w-40 truncate text-sm">{w.query}</span>
            <div className="h-4 rounded bg-blue-200" style={{ width: `${(w.count / max) * 100}%` }} />
            <span className="text-sm text-gray-500">{w.count} 次（省 {w.cacheHits} 次额度）</span>
          </div>
        ))}
      </div>
    </main>
  )
}
