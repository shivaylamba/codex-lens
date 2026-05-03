'use client'

import useSWR from 'swr'
import { Bot, GitBranch, Wrench } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CodexAgentSummary } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function AgentsPage() {
  const { data, error, isLoading } = useSWR<CodexAgentSummary>('/api/agents', fetcher, { refreshInterval: 15_000 })

  return (
    <div>
      <TopBar title="Agents" subtitle="Subagent spawn edges, dynamic tools, goals, jobs, and automations" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load agent data: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric label="Spawn Edges" value={data.spawn_edges.length.toLocaleString()} />
              <Metric label="Dynamic Tools" value={data.dynamic_tools.length.toLocaleString()} />
              <Metric label="Goals" value={data.goals.length.toLocaleString()} />
              <Metric label="Automations" value={data.automations.length.toLocaleString()} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><GitBranch className="w-4 h-4" /> Spawn Graph</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.spawn_edges.map(edge => (
                    <div key={edge.child_thread_id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{edge.child_thread_id}</p>
                        <Badge variant="outline">{edge.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">Parent: {edge.parent_thread_id}</p>
                    </div>
                  ))}
                  {!data.spawn_edges.length && <p className="text-sm text-muted-foreground">No spawn edges found.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Dynamic Tools</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.dynamic_tools.map((tool, index) => (
                    <div key={`${tool.thread_id}-${tool.name}-${index}`} className="flex items-center justify-between gap-4 text-sm border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{tool.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{tool.thread_id}</p>
                      </div>
                      <Badge variant="outline">{tool.namespace || 'local'}</Badge>
                    </div>
                  ))}
                  {!data.dynamic_tools.length && <p className="text-sm text-muted-foreground">No dynamic tools found.</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4" /> Jobs & Automations</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <JsonBlock title="Jobs" value={data.jobs} />
                  <JsonBlock title="Agent Jobs" value={data.agent_jobs} />
                  <JsonBlock title="Automation Runs" value={data.automation_runs} />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">{title}</p>
      <pre className="mt-2 max-h-72 overflow-auto text-xs text-muted-foreground">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}
