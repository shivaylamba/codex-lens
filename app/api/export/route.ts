import { NextResponse } from 'next/server'
import { getSessions, readHistory, readInventory, readStatsCache } from '@/lib/codex-reader'
import type { ExportPayload, SessionMeta } from '@/types/claude'

export const dynamic = 'force-dynamic'

function filterSessions(sessions: SessionMeta[], dateRange?: { from?: string; to?: string }) {
  const fromMs = dateRange?.from ? new Date(dateRange.from).getTime() : null
  const toMs = dateRange?.to ? new Date(`${dateRange.to}T23:59:59.999Z`).getTime() : null
  return sessions.filter(s => {
    const t = new Date(s.start_time).getTime()
    if (fromMs !== null && t < fromMs) return false
    if (toMs !== null && t > toMs) return false
    return true
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined
  const dateRange = from || to ? { from, to } : undefined
  const [stats, sessions, history, inventory] = await Promise.all([
    readStatsCache(),
    getSessions(),
    readHistory(10_000),
    readInventory(0),
  ])
  const filtered = filterSessions(sessions, dateRange)
  return NextResponse.json({
    sessionCount: filtered.length,
    facetCount: 0,
    historyEntries: history.length,
    hasStatsCache: true,
    totalSessionsIndexed: sessions.length,
    inventoryFiles: inventory.totalFiles,
    statsVersion: stats.version,
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { dateRange } = body as { dateRange?: { from?: string; to?: string } }
  const [stats, sessions, history, inventory] = await Promise.all([
    readStatsCache(),
    getSessions(),
    readHistory(10_000),
    readInventory(500),
  ])
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    stats,
    sessions: filterSessions(sessions, dateRange),
    facets: [],
    history,
    inventory: inventory.items,
  }
  return NextResponse.json(payload)
}
