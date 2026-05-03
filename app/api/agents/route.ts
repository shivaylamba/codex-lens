import { NextResponse } from 'next/server'
import { readAgentSummary } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await readAgentSummary())
}
