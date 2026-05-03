import { NextResponse } from 'next/server'
import { getProjectSummaries, getSessions } from '@/lib/codex-reader'
import { estimateCostFromUsage } from '@/lib/pricing'
import { slugToPath, projectDisplayName } from '@/lib/decode'
import type { SessionWithFacet } from '@/types/claude'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const projectPath = slugToPath(slug)
  const [allSessions, projects] = await Promise.all([getSessions(), getProjectSummaries()])
  const project = projects.find(p => p.slug === slug || p.project_path === projectPath)
  const resolvedPath = project?.project_path ?? projectPath
  const sessions = allSessions.filter(s => s.project_path === resolvedPath)

  const enrichedSessions: SessionWithFacet[] = sessions.map(s => ({
    ...s,
    estimated_cost: estimateCostFromUsage(s.model ?? 'unknown', {
      input_tokens: s.input_tokens,
      output_tokens: s.output_tokens,
      cache_creation_input_tokens: s.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: s.cache_read_input_tokens ?? 0,
    }),
    version: s.cli_version,
    has_thinking: (s.reasoning_output_tokens ?? 0) > 0,
  }))

  const tool_counts: Record<string, number> = {}
  const branches = new Map<string, number>()
  for (const s of sessions) {
    for (const [tool, count] of Object.entries(s.tool_counts)) tool_counts[tool] = (tool_counts[tool] ?? 0) + count
    if (s.git_branch) branches.set(s.git_branch, (branches.get(s.git_branch) ?? 0) + 1)
  }

  return NextResponse.json({
    project_path: resolvedPath,
    display_name: projectDisplayName(resolvedPath),
    sessions: enrichedSessions.sort((a, b) => b.start_time.localeCompare(a.start_time)),
    tool_counts,
    cost_by_session: enrichedSessions.map(s => ({
      session_id: s.session_id,
      start_time: s.start_time,
      cost: s.estimated_cost,
      messages: s.user_message_count + s.assistant_message_count,
    })),
    branches: [...branches.entries()].map(([branch, turns]) => ({ branch, turns })).sort((a, b) => b.turns - a.turns),
  })
}
