import { NextResponse } from 'next/server'
import { readConfigSummary } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await readConfigSummary())
}
