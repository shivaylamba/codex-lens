import { NextResponse } from 'next/server'
import { getSessions } from '@/lib/codex-reader'
import { estimateCostFromUsage } from '@/lib/pricing'
import type { SessionWithFacet } from '@/types/claude'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 250), 1), 1000)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
  const allSessions = await getSessions({ includeRolloutFallback: false })
  const sessions = allSessions.slice(offset, offset + limit)
  const result: SessionWithFacet[] = sessions.map(s => ({
    ...s,
    estimated_cost: estimateCostFromUsage(s.model ?? 'unknown', {
      input_tokens: s.input_tokens ?? 0,
      output_tokens: s.output_tokens ?? 0,
      cache_creation_input_tokens: s.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: s.cache_read_input_tokens ?? 0,
    }),
    slug: s.project_path ? s.project_path.replace(/\//g, '-') : undefined,
    version: s.cli_version,
    git_branch: s.git_branch,
    has_compaction: false,
    has_thinking: (s.reasoning_output_tokens ?? 0) > 0,
  }))
  return NextResponse.json({ sessions: result, total: allSessions.length, limit, offset })
}
