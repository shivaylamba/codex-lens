import { NextResponse } from 'next/server'
import { readInventory } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '5000', 10), 10_000)
  return NextResponse.json(await readInventory(limit))
}
