import { NextRequest, NextResponse } from 'next/server'
import { createZhihuClient } from '@/lib/zhihu/client'
import { throttleZhihu } from '@/lib/rate-limit'
import { searchAnswers } from '@/lib/search-service'
import { getCachedResults, getStaleResults, logSearch, saveSearchResults } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  try {
    const result = await searchAnswers(
      {
        getCached: getCachedResults,
        getStale: getStaleResults,
        save: saveSearchResults,
        log: logSearch,
        fetchFromZhihu: (query) => createZhihuClient(process.env.ZHIHU_ACCESS_TOKEN!).search(query),
        throttle: throttleZhihu,
      },
      q
    )
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'EMPTY_QUERY') {
      return NextResponse.json({ error: '请输入搜索关键词' }, { status: 400 })
    }
    console.error('[search] failed:', err)
    return NextResponse.json({ error: '搜索失败，请稍后重试' }, { status: 502 })
  }
}
