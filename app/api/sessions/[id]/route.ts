import { NextResponse } from 'next/server'
import { readSessionMeta } from '@/lib/codex-reader'
import { estimateCostFromUsage } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await readSessionMeta(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  return NextResponse.json({
    session: {
      ...session,
      estimated_cost: estimateCostFromUsage(session.model ?? 'unknown', {
        input_tokens: session.input_tokens ?? 0,
        output_tokens: session.output_tokens ?? 0,
        cache_creation_input_tokens: session.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: session.cache_read_input_tokens ?? 0,
      }),
      version: session.cli_version,
      has_thinking: (session.reasoning_output_tokens ?? 0) > 0,
    },
  })
}
