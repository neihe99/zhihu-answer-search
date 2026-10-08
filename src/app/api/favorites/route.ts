import { NextRequest, NextResponse } from 'next/server'
import { addFavorite, listFavorites, removeFavorite } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const items = await listFavorites()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body?.item?.id) return NextResponse.json({ error: '缺少 item' }, { status: 400 })
  await addFavorite(body.item)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  await removeFavorite(id)
  return NextResponse.json({ ok: true })
}
