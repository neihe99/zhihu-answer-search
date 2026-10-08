import { NextResponse } from 'next/server'
import { getRecentQueries } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const queries = await getRecentQueries(10)
  return NextResponse.json({ queries })
}
