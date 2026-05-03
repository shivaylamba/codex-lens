import { NextResponse } from 'next/server'
import { getSessions, readStatsCache } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

function computeStreaks(dates: Set<string>): { current: number; longest: number } {
  const sorted = [...dates].sort()
  if (!sorted.length) return { current: 0, longest: 0 }
  let longest = 1
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    if ((curr.getTime() - prev.getTime()) / 86_400_000 === 1) {
      streak++
      longest = Math.max(longest, streak)
    } else {
      streak = 1
    }
  }
  let current = 0
  const d = new Date()
  while (dates.has(d.toISOString().slice(0, 10))) {
    current++
    d.setDate(d.getDate() - 1)
  }
  return { current, longest }
}

export async function GET() {
  const [stats, sessions] = await Promise.all([readStatsCache(), getSessions()])
  const activeDates = new Set<string>()
  const dowCounts = [0, 0, 0, 0, 0, 0, 0]
  const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))

  for (const s of sessions) {
    const d = new Date(s.start_time)
    if (Number.isNaN(d.getTime())) continue
    activeDates.add(s.start_time.slice(0, 10))
    dowCounts[d.getDay()]++
    const hours = s.user_message_timestamps.length ? s.user_message_timestamps.map(ts => new Date(ts).getHours()) : [d.getHours()]
    for (const hour of hours) if (hour >= 0 && hour < 24) hourCounts[hour].count++
  }

  let mostActiveDay = ''
  let mostActiveMsgs = 0
  for (const day of stats.dailyActivity) {
    if (day.messageCount > mostActiveMsgs) {
      mostActiveDay = day.date
      mostActiveMsgs = day.messageCount
    }
  }

  return NextResponse.json({
    daily_activity: stats.dailyActivity,
    hour_counts: hourCounts,
    dow_counts: dowCounts.map((count, i) => ({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], count })),
    streaks: computeStreaks(activeDates),
    most_active_day: mostActiveDay,
    most_active_day_msgs: mostActiveMsgs,
    total_active_days: activeDates.size,
  })
}
