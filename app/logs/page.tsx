'use client'

import useSWR from 'swr'
import { AlertTriangle, ScrollText } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/decode'
import type { CodexLogSummary } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function LogsPage() {
  const { data, error, isLoading } = useSWR<CodexLogSummary>('/api/logs?limit=300', fetcher, { refreshInterval: 10_000 })

  return (
    <div>
      <TopBar title="Logs" subtitle="SQLite log metadata and redacted recent messages" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load logs: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric label="Log Rows" value={data.total.toLocaleString()} />
              {data.levels.slice(0, 3).map(level => <Metric key={level.level} label={level.level} value={level.count.toLocaleString()} />)}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScrollText className="w-4 h-4" /> Targets</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.targets.map(target => (
                    <div key={target.target} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{target.target}</span>
                      <span className="text-muted-foreground">{target.count.toLocaleString()}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Recent</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.recent.map(row => (
                      <div key={row.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant={row.level === 'ERROR' ? 'destructive' : 'outline'}>{row.level}</Badge>
                            <span className="text-sm truncate">{row.target}</span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(new Date(row.ts * 1000).toISOString())}</span>
                        </div>
                        {row.message && <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">{row.message}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>
}
