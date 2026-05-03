import { NextResponse } from 'next/server'
import { getCodexStorageBytes, getSessions, readStatsCache } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [stats, sessions, storageBytes] = await Promise.all([
    readStatsCache(),
    getSessions(),
    getCodexStorageBytes(),
  ])

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheWriteTokens = 0

  for (const usage of Object.values(stats.modelUsage)) {
    totalInputTokens += usage.inputTokens ?? 0
    totalOutputTokens += usage.outputTokens ?? 0
    totalCacheReadTokens += usage.cacheReadInputTokens ?? 0
    totalCacheWriteTokens += usage.cacheCreationInputTokens ?? 0
  }

  const totalToolCalls = sessions.reduce(
    (sum, s) => sum + Object.values(s.tool_counts ?? {}).reduce((a, b) => a + b, 0),
    0
  )
  const activeDays = stats.dailyActivity.filter(d => d.sessionCount > 0).length
  const avgSessionMinutes = sessions.length
    ? sessions.reduce((sum, s) => sum + s.duration_minutes, 0) / sessions.length
    : 0

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)

  return NextResponse.json({
    stats,
    computed: {
      totalCost: 0,
      totalCacheSavings: 0,
      totalTokens: totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheWriteTokens,
      totalToolCalls,
      activeDays,
      avgSessionMinutes,
      sessionsThisMonth: sessions.filter(s => new Date(s.start_time) >= monthStart).length,
      sessionsThisWeek: sessions.filter(s => new Date(s.start_time) >= weekStart).length,
      storageBytes,
      sessionCount: sessions.length,
    },
  })
}
