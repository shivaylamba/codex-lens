import { NextResponse } from 'next/server'
import { getProjectSummaries } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ projects: await getProjectSummaries() })
}
