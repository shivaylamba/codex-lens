'use client'

import useSWR from 'swr'
import { Server, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CodexConfigSummary, CodexSkillSummary } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function ConfigPage() {
  const { data, error, isLoading } = useSWR<CodexConfigSummary>('/api/config', fetcher, { refreshInterval: 30_000 })
  const { data: skillsData } = useSWR<{ skills: CodexSkillSummary[] }>('/api/skills', fetcher, { refreshInterval: 30_000 })

  return (
    <div>
      <TopBar title="Config" subtitle="Redacted config, trusted projects, MCP servers, plugins, marketplaces, and model cache" />
      <main className="space-y-6 px-4 py-5 md:px-6 md:py-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load config: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Trusted Projects" value={data.trustedProjects.length.toLocaleString()} />
              <Metric label="MCP Servers" value={data.mcpServers.length.toLocaleString()} />
              <Metric label="Plugins" value={data.plugins.length.toLocaleString()} />
              <Metric label="Skills" value={(skillsData?.skills.length ?? 0).toLocaleString()} />
              <Metric label="Models" value={data.models.length.toLocaleString()} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card className="min-w-0">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Server className="w-4 h-4" /> MCP Servers</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.mcpServers.map(server => (
                    <div key={server.name} className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{server.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{server.url ?? server.command ?? server.transport}</p>
                      </div>
                      <Badge variant="outline">{server.transport}</Badge>
                    </div>
                  ))}
                  {!data.mcpServers.length && <p className="text-sm text-muted-foreground">No MCP servers found.</p>}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Plugins</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.plugins.map(plugin => (
                    <div key={plugin.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{plugin.id}</span>
                      <Badge variant={plugin.enabled ? 'default' : 'outline'}>{plugin.enabled ? 'enabled' : 'disabled'}</Badge>
                    </div>
                  ))}
                  {!data.plugins.length && <p className="text-sm text-muted-foreground">No configured plugins found.</p>}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
              <Card className="min-w-0">
                <CardHeader><CardTitle className="text-base">Redacted config.toml</CardTitle></CardHeader>
                <CardContent>
                  <pre className="max-h-[520px] overflow-auto rounded-lg border border-[#1f2937] bg-[#0b0f19] p-4 font-mono text-xs leading-5 text-[#e5e7eb]">{data.configPreview || 'No config.toml found.'}</pre>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Trusted Projects</CardTitle></CardHeader>
                <CardContent className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {data.trustedProjects.slice(0, 80).map(project => (
                    <div key={project.path} className="min-w-0 rounded-lg border border-border/60 bg-card/45 p-3 text-sm">
                      <p className="break-all font-medium leading-5">{project.path}</p>
                      <p className="text-xs text-muted-foreground">{project.trust_level}</p>
                    </div>
                  ))}
                  {!data.trustedProjects.length && <p className="text-sm text-muted-foreground">No trusted projects found.</p>}
                  {data.trustedProjects.length > 80 && (
                    <p className="text-xs text-muted-foreground">Showing 80 of {data.trustedProjects.length.toLocaleString()} trusted projects.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Skills Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(['user', 'system', 'plugin', 'external'] as CodexSkillSummary['source'][]).map(source => (
                    <div key={source} className="rounded-lg border border-border/70 bg-card/50 p-4">
                      <p className="text-xs capitalize text-muted-foreground">{source}</p>
                      <p className="mt-2 text-2xl font-semibold">
                        {(skillsData?.skills.filter(skill => skill.source === source).length ?? 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
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
  return (
    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>
  )
}
