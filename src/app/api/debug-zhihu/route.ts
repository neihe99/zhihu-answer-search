import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 临时诊断接口：把知乎搜索的原始返回透出来，确认 Vercel 出口 IP 是否被平台限制
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? 'RAG'
  const token = process.env.ZHIHU_ACCESS_TOKEN ?? ''
  const url = new URL('https://developer.zhihu.com/api/v1/content/zhihu_search')
  url.searchParams.set('Query', q)
  url.searchParams.set('Count', '5')
  url.searchParams.set('SortBy', 'VoteUpCount:desc:(100,)')
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      'Content-Type': 'application/json',
    },
  })
  const body = await resp.json()
  return NextResponse.json({
    httpStatus: resp.status,
    code: body.Code,
    message: body.Message,
    emptyReason: body.Data?.EmptyReason ?? null,
    itemCount: body.Data?.Items?.length ?? 0,
    tokenPrefix: token.slice(0, 6) + '...',
  })
}
