import { NextResponse } from 'next/server'
import { getSessions } from '@/lib/codex-reader'
import type { ExportPayload, ImportDiff } from '@/types/claude'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null) as ExportPayload | null
  if (!payload?.sessions) return NextResponse.json({ error: 'Invalid import payload' }, { status: 400 })

  const existing = await getSessions()
  const existingIds = new Set(existing.map(s => s.session_id))
  const sessions_to_add = payload.sessions.filter(s => !existingIds.has(s.session_id))
  const diff: ImportDiff = {
    total_in_export: payload.sessions.length,
    already_present: payload.sessions.length - sessions_to_add.length,
    new_sessions: sessions_to_add.length,
    sessions_to_add,
  }
  return NextResponse.json(diff)
}
