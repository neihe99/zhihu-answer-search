import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/auth'
import { cleanupExpired } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const deleted = await cleanupExpired()
  return NextResponse.json({ ok: true, deleted })
}
