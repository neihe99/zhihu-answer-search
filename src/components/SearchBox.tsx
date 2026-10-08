'use client'
import { useState } from 'react'

export function SearchBox({ onSearch, loading }: { onSearch: (q: string) => void; loading: boolean }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => { e.preventDefault(); onSearch(value) }}
    >
      <input
        className="flex-1 rounded border px-3 py-2"
        placeholder="输入问题，如：怎么理解 RAG 的评测方法"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={loading}>
        {loading ? '搜索中…' : '搜索'}
      </button>
    </form>
  )
}
