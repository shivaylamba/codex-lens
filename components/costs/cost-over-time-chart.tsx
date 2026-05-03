'use client'

import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { formatCost } from '@/lib/decode'
import type { DailyCost } from '@/types/claude'

const MODEL_COLORS: Record<string, string> = {
  'gpt-5.5':       '#6366f1',
  'gpt-5.4':       'var(--viz-sky)',
  'gpt-5.3-codex': '#10b981',
  'crest-alpha':   '#8b5cf6',
}

function colorForModel(m: string): string {
  for (const [key, col] of Object.entries(MODEL_COLORS)) {
    if (m.includes(key.split('-').slice(2).join('-'))) return col
  }
  return '#7a8494'
}

function shortModel(m: string): string {
  return m
}

interface Props {
  daily: DailyCost[]
}

type Window = 30 | 90 | 365

export function CostOverTimeChart({ daily }: Props) {
  const [window, setWindow] = useState<Window>(90)

  const { data, models } = useMemo(() => {
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date))
    const sliced = sorted.slice(-window)
    const modelSet = new Set<string>()
    for (const d of sliced) Object.keys(d.costs ?? {}).forEach(m => modelSet.add(m))
    const models = [...modelSet]
    return {
      data: sliced.map(d => ({
        date: d.date.slice(5), // MM-DD
        ...Object.fromEntries(models.map(m => [m, d.costs[m] ?? 0])),
        total: d.total,
      })),
      models,
    }
  }, [daily, window])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest">Cost Over Time</h3>
        <div className="flex gap-1">
          {([30, 90, 365] as Window[]).map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded-full px-2 py-0.5 text-[12px] transition-colors ${window === w ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground border border-border/80 bg-card/60'}`}
            >
              {w === 365 ? 'All' : `${w}d`}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(2)}`} width={48} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
            formatter={(val: number | undefined, name?: string) => [formatCost(val ?? 0), shortModel(name ?? '')]}
          />
          {models.map(m => (
            <Area
              key={m}
              type="monotone"
              dataKey={m}
              stackId="1"
              stroke={colorForModel(m)}
              fill={colorForModel(m) + '30'}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
