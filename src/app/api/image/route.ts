import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_HOST_SUFFIX = '.zhimg.com'
const UPSTREAM_REFERER = 'https://www.zhihu.com'

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname.endsWith(ALLOWED_HOST_SUFFIX)
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') ?? ''
  if (!isAllowedImageUrl(url)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const upstream = await fetch(url, { headers: { Referer: UPSTREAM_REFERER } })
  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: 502 })
  }
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
