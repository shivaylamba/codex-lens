'use client'

import { Activity, Database, Gauge, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/decode'
import type { ContextUsageSnapshot } from '@/types/claude'

interface Props {
  usage?: ContextUsageSnapshot
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function Segment({
  value,
  total,
  className,
}: {
  value: number
  total: number
  className: string
}) {
  const width = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0
  return <div className={className} style={{ width: `${width}%` }} />
}

export function ContextUsagePanel({ usage }: Props) {
  if (!usage) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            Context Usage
          </CardTitle>
          <CardDescription>No Codex token_count context snapshot was recorded for this session.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const window = usage.model_context_window
  const remaining = Math.max(0, window - usage.input_tokens)
  const inputLabel = window
    ? `~${formatTokens(usage.input_tokens)} / ${formatTokens(window)} tokens`
    : `${formatTokens(usage.input_tokens)} input tokens`

  const rows = [
    { label: 'Fresh input', value: usage.fresh_input_tokens, color: 'bg-[#6366f1]' },
    { label: 'Cached input', value: usage.cached_input_tokens, color: 'bg-[#10b981]' },
    { label: 'Remaining window', value: remaining, color: 'bg-muted-foreground/20' },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-[#6366f1]" />
              Context Usage
            </CardTitle>
            <CardDescription>
              Latest recorded Codex token_count snapshot for this session
            </CardDescription>
          </div>
          <div className="text-left md:text-right">
            <p className="text-sm font-semibold text-foreground">
              {window ? `${pct(usage.context_percent)} full` : 'Context window unavailable'}
            </p>
            <p className="text-xs text-muted-foreground">{inputLabel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="flex h-full w-full">
            <Segment value={usage.fresh_input_tokens} total={window || usage.input_tokens} className="bg-[#6366f1]" />
            <Segment value={usage.cached_input_tokens} total={window || usage.input_tokens} className="bg-[#10b981]" />
            <Segment value={remaining} total={window || usage.input_tokens} className="bg-muted-foreground/18" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-3 w-3 shrink-0 rounded-sm ${row.color}`} />
                <span className="truncate text-sm text-muted-foreground">{row.label}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatTokens(row.value)}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Output
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatTokens(usage.output_tokens)}</p>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Reasoning
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatTokens(usage.reasoning_output_tokens)}</p>
          </div>
          <div className="rounded-lg border border-border/70 px-3 py-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Session total
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatTokens(usage.session_total_tokens)}
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Codex currently records total input/cache/output/reasoning tokens and model context window. It does not expose exact tokenizer buckets for rules, skills, MCP, tools, subagents, and conversation like Cursor does, so this panel avoids inventing those categories.
        </p>
      </CardContent>
    </Card>
  )
}
