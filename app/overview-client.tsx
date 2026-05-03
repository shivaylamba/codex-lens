'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { BarChart3, PieChart, Clock, CalendarDays } from 'lucide-react'
import { UsageOverTimeChart } from '@/components/overview/usage-over-time-chart'
import { ModelBreakdownDonut } from '@/components/overview/model-breakdown-donut'
import { ProjectActivityDonut } from '@/components/overview/project-activity-donut'
import { PeakHoursChart } from '@/components/overview/peak-hours-chart'
import { OverviewConversationTable } from '@/components/overview/conversation-table'
import { StatCard } from '@/components/overview/stat-card'
import { formatTokens, formatBytes } from '@/lib/decode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { StatsCache, DailyActivity, DailyTokens } from '@/types/claude'
import type { SessionWithFacet, ProjectSummary } from '@/types/claude'
import { format, subDays } from 'date-fns'
import { useTheme } from '@/components/theme-provider'
import { CodexLogo } from '@/components/codex-logo'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse {
  stats: StatsCache
  computed: {
    totalCost: number
    totalCacheSavings: number
    totalTokens: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheReadTokens: number
    totalCacheWriteTokens: number
    totalToolCalls: number
    activeDays: number
    avgSessionMinutes: number
    sessionsThisMonth: number
    sessionsThisWeek: number
    storageBytes: number
    sessionCount: number
  }
}

type DatePreset = '7d' | '30d' | '90d'
type CustomRange = { from?: Date; to?: Date }
const DAY_MS = 24 * 60 * 60 * 1000

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`API error ${r.status}`)
    return r.json()
  })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTrend(
  dailyActivity: DailyActivity[],
  field: 'messageCount' | 'sessionCount',
  days = 7,
): number | undefined {
  const sorted = [...dailyActivity].sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-days)
  const previous = sorted.slice(-(days * 2), -days)
  if (!recent.length || !previous.length) return undefined
  const recentSum = recent.reduce((s, d) => s + (d[field] ?? 0), 0)
  const prevSum = previous.reduce((s, d) => s + (d[field] ?? 0), 0)
  if (prevSum === 0) return undefined
  return ((recentSum - prevSum) / prevSum) * 100
}

function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return ((current - previous) / previous) * 100
}

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function inRange(date: string, from: string, to: string): boolean {
  const key = date.slice(0, 10)
  return key >= from && key <= to
}

function sumDailyActivity(days: DailyActivity[], field: 'messageCount' | 'sessionCount' | 'toolCallCount'): number {
  return days.reduce((sum, day) => sum + (day[field] ?? 0), 0)
}

function sumDailyTokens(days: DailyTokens[]): number {
  return days.reduce((sum, day) => (
    sum + Object.values(day.tokensByModel ?? {}).reduce((inner, value) => inner + value, 0)
  ), 0)
}

function getActivitySpark(dailyActivity: DailyActivity[], field: 'messageCount' | 'sessionCount', days = 14): number[] {
  return [...dailyActivity]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map(d => d[field] ?? 0)
}

function getTokenSpark(tokensByDate: DailyTokens[], days = 14): number[] {
  return [...tokensByDate]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map(d => Object.values(d.tokensByModel ?? {}).reduce((s, v) => s + v, 0))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverviewClient() {
  const { theme } = useTheme()
  const [datePreset, setDatePreset] = useState<DatePreset>('30d')
  const [customRange, setCustomRange] = useState<CustomRange>({})
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data, error, isLoading } = useSWR<ApiResponse>('/api/stats', fetcher, {
    refreshInterval: 5_000,
  })
  const { data: sessionsData } = useSWR<{ sessions: SessionWithFacet[] }>('/api/sessions?limit=20', fetcher)
  const { data: projectsData } = useSWR<{ projects: ProjectSummary[] }>('/api/projects', fetcher, {
    refreshInterval: 5_000,
  })

  const sessions = sessionsData?.sessions ?? []
  const projects = projectsData?.projects ?? []
  const projectCount = projects.length

  const usingCustom = !!(customRange.from && customRange.to)
  const chartDays = usingCustom
    ? Math.max(1, Math.floor((customRange.to!.getTime() - customRange.from!.getTime()) / DAY_MS) + 1)
    : datePreset === '7d' ? 7 : datePreset === '30d' ? 30 : 90
  const rangeStart = usingCustom ? customRange.from! : subDays(new Date(), chartDays - 1)
  const rangeEnd = usingCustom ? customRange.to! : new Date()
  const rangeStartKey = dateKey(rangeStart)
  const rangeEndKey = dateKey(rangeEnd)
  const effectiveDateFrom = format(rangeStart, 'MM/dd/yyyy')
  const effectiveDateTo = format(rangeEnd, 'MM/dd/yyyy')

  const pickerLabel = usingCustom
    ? `${format(customRange.from!, 'MMM d')} – ${format(customRange.to!, 'MMM d, yyyy')}`
    : 'Pick a date'

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading || !data || !data.computed) {
    return (
      <div className="space-y-6 px-4 py-5 md:px-6 md:py-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-5 text-sm text-destructive md:px-6 md:py-6">
        Error loading data: {String(error)}
      </div>
    )
  }

  const { stats, computed } = data

  const tokensByDate = stats.dailyModelTokens ?? stats.tokensByDate ?? []
  const selectedDailyActivity = stats.dailyActivity.filter(day => inRange(day.date, rangeStartKey, rangeEndKey))
  const selectedDailyTokens = tokensByDate.filter(day => inRange(day.date, rangeStartKey, rangeEndKey))
  const previousStartKey = dateKey(subDays(rangeStart, chartDays))
  const previousEndKey = dateKey(subDays(rangeStart, 1))
  const previousDailyActivity = stats.dailyActivity.filter(day => inRange(day.date, previousStartKey, previousEndKey))

  const selectedSessionCount = sumDailyActivity(selectedDailyActivity, 'sessionCount')
  const selectedMessageCount = sumDailyActivity(selectedDailyActivity, 'messageCount')
  const selectedTokenTotal = sumDailyTokens(selectedDailyTokens)
  const selectedCost = 0
  const selectedActiveDays = selectedDailyActivity.filter(day => day.messageCount > 0 || day.sessionCount > 0).length
  const periodLabel = usingCustom ? 'custom range' : `last ${chartDays} days`

  const inputBlue = theme === 'light' ? '#4f46e5' : '#a5b4fc'
  const tokenSegs = [
    { label: 'total', value: selectedTokenTotal, color: inputBlue },
  ]

  // Trends compare last N days vs previous N days (capped at 30 to avoid sparse data)
  const trendWindow = Math.min(Math.max(chartDays, 7), 30)
  const selectedSessionTrend = percentChange(
    selectedSessionCount,
    sumDailyActivity(previousDailyActivity, 'sessionCount'),
  ) ?? computeTrend(stats.dailyActivity, 'sessionCount', trendWindow)
  const selectedMessageTrend = percentChange(
    selectedMessageCount,
    sumDailyActivity(previousDailyActivity, 'messageCount'),
  ) ?? computeTrend(stats.dailyActivity, 'messageCount', trendWindow)

  return (
    <div className="space-y-6 px-4 py-5 md:px-6 md:py-6">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <section className="-mx-4 -mt-5 border-b border-border/70 bg-[linear-gradient(135deg,rgba(219,234,254,0.82),rgba(224,231,255,0.78)_42%,rgba(249,250,251,0.62))] px-4 py-6 backdrop-blur-xl md:-mx-6 md:-mt-6 md:px-6 dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.88),rgba(30,27,75,0.68)_55%,rgba(11,15,25,0.92))]">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="flex min-w-0 items-start gap-4">
            <CodexLogo className="size-16 shrink-0" imageClassName="p-2" priority />
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#4f46e5] dark:text-[#c7d2fe]">
                Local Codex Intelligence
              </p>
              <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
                Codex dashboard for your ~/.codex workspace
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {projectCount} projects, {selectedSessionCount.toLocaleString()} sessions in {periodLabel}, and {formatBytes(computed.storageBytes)} of local Codex state summarized without cloud telemetry.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Tabs
            value={usingCustom ? '' : datePreset}
            onValueChange={v => {
              setDatePreset(v as DatePreset)
              setCustomRange({})
            }}
          >
            <TabsList>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="90d">90d</TabsTrigger>
            </TabsList>
          </Tabs>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={usingCustom ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {pickerLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: customRange.from, to: customRange.to }}
                onSelect={range => {
                  setCustomRange({ from: range?.from, to: range?.to })
                  if (range?.from && range?.to) setPickerOpen(false)
                }}
                disabled={{ after: new Date() }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          </div>
        </div>
      </section>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sessions"
          value={selectedSessionCount.toLocaleString()}
          description={`${selectedActiveDays} active days · ${periodLabel}`}
          trend={selectedSessionTrend}
          sparkData={getActivitySpark(selectedDailyActivity, 'sessionCount', Math.min(chartDays, 30))}
          accentColor="var(--foreground)"
        />
        <StatCard
          title="Messages"
          value={selectedMessageCount.toLocaleString()}
          description={`${sumDailyActivity(selectedDailyActivity, 'toolCallCount').toLocaleString()} tool calls · ${periodLabel}`}
          trend={selectedMessageTrend}
          sparkData={getActivitySpark(selectedDailyActivity, 'messageCount', Math.min(chartDays, 30))}
          accentColor="#6366f1"
        />
        <StatCard
          title="Tokens Used"
          value={formatTokens(selectedTokenTotal)}
          description={`${periodLabel} aggregate`}
          sparkData={getTokenSpark(selectedDailyTokens, Math.min(chartDays, 30))}
          accentColor={inputBlue}
        />
        <StatCard
          title="Estimated Cost"
          value={`$${selectedCost.toFixed(2)}`}
          description={`Pricing estimate · ${periodLabel}`}
          sparkData={getTokenSpark(selectedDailyTokens, Math.min(chartDays, 30))}
          accentColor="#10b981"
        />
      </div>

      {/* ── Main charts row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Usage Over Time</CardTitle>
                <CardDescription>
                  Messages and sessions — last {chartDays} days
                </CardDescription>
              </div>
              <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5" />
            </div>
          </CardHeader>
          <CardContent>
            <UsageOverTimeChart
              data={stats.dailyActivity}
              days={chartDays}
              dateFrom={effectiveDateFrom}
              dateTo={effectiveDateTo}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Model Distribution</CardTitle>
                <CardDescription>Token usage by model</CardDescription>
              </div>
              <PieChart className="w-4 h-4 text-muted-foreground mt-0.5" />
            </div>
          </CardHeader>
          <CardContent>
            <ModelBreakdownDonut modelUsage={stats.modelUsage} />
          </CardContent>
        </Card>
      </div>

      {/* ── Secondary charts row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Peak Hours</CardTitle>
                <CardDescription>Activity by hour of day</CardDescription>
              </div>
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
            </div>
          </CardHeader>
          <CardContent>
            <PeakHoursChart hourCounts={stats.hourCounts ?? {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Project Activity</CardTitle>
                <CardDescription>Distribution across projects</CardDescription>
              </div>
              <PieChart className="w-4 h-4 text-muted-foreground mt-0.5" />
            </div>
          </CardHeader>
          <CardContent>
            <ProjectActivityDonut projects={projects} />
          </CardContent>
        </Card>
      </div>

      {/* ── Token breakdown ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Token Breakdown</CardTitle>
          <CardDescription>Distribution across token types ({periodLabel})</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedTokenTotal > 0 ? (
            <>
              <div className="flex h-2 rounded-full overflow-hidden w-full bg-muted/40">
                {tokenSegs.map(({ label, value, color }) => (
                  <div
                    key={label}
                    title={`${label}: ${formatTokens(value)}`}
                    style={{
                      width: `${selectedTokenTotal > 0 ? (value / selectedTokenTotal) * 100 : 0}%`,
                      minWidth: value > 0 ? 2 : 0,
                      backgroundColor: color,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {tokenSegs.map(({ label, value, color }) => (
                  <span key={label} className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[12px] text-muted-foreground">{label}</span>
                    <span className="text-[13px] font-bold tabular-nums font-mono" style={{ color }}>
                      {formatTokens(value)}
                    </span>
                    <span className="text-[12px] text-muted-foreground/60">
                      {Math.round((value / selectedTokenTotal) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No token usage recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Recent sessions ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>Your latest Codex sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <OverviewConversationTable sessions={sessions} />
        </CardContent>
      </Card>

    </div>
  )
}
