import { NextResponse } from 'next/server'
import { readLogSummary } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000)
  return NextResponse.json(await readLogSummary(limit))
}
