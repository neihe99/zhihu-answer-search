import { NextRequest, NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'

export function middleware(req: NextRequest): NextResponse {
  if (!isAuthorized(req.headers.get('authorization'), process.env.SITE_PASSWORD)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="zhihu-search"' },
    })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
