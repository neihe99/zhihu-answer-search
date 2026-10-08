import { NextResponse } from 'next/server'
import { getHotWords, getStatsSummary } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [hotWords, summary] = await Promise.all([getHotWords(30), getStatsSummary(30)])
  return NextResponse.json({ hotWords, summary })
}
