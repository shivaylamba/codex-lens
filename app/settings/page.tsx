'use client'

import useSWR from 'swr'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/decode'

interface SettingsResponse {
  settings: Record<string, unknown>
  storageBytes: number
  skills: Array<{ name: string; description: string; path?: string }>
  plugins: Array<{ id: string; scope: string; version: string; path?: string }>
  config?: {
    trustedProjects: Array<unknown>
    mcpServers: Array<unknown>
    models: Array<unknown>
    globalStateKeys: string[]
  }
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function SettingsPage() {
  const { data, error, isLoading } = useSWR<SettingsResponse>('/api/settings', fetcher, { refreshInterval: 30_000 })

  return (
    <div>
      <TopBar title="Settings" subtitle="Codex Lens view of ~/.codex runtime state" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load settings: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric label="Storage" value={formatBytes(data.storageBytes)} />
              <Metric label="Skills" value={data.skills.length.toLocaleString()} />
              <Metric label="Cached Plugins" value={data.plugins.length.toLocaleString()} />
              <Metric label="Models" value={(data.config?.models.length ?? 0).toLocaleString()} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.skills.map(skill => (
                    <div key={skill.path ?? skill.name} className="rounded-md border border-border p-3">
                      <p className="text-sm font-medium">{skill.name}</p>
                      {skill.description && <p className="mt-1 text-xs text-muted-foreground">{skill.description}</p>}
                    </div>
                  ))}
                  {!data.skills.length && <p className="text-sm text-muted-foreground">No skills found.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Plugins</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.plugins.map(plugin => (
                    <div key={plugin.path ?? plugin.id} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{plugin.id}</p>
                        <p className="text-xs text-muted-foreground truncate">{plugin.scope}</p>
                      </div>
                      {plugin.version && <Badge variant="outline">v{plugin.version}</Badge>}
                    </div>
                  ))}
                  {!data.plugins.length && <p className="text-sm text-muted-foreground">No cached plugin manifests found.</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">State Summary</CardTitle></CardHeader>
              <CardContent>
                <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-4 text-xs leading-5">{JSON.stringify(data.settings, null, 2)}</pre>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold truncate">{value}</p></CardContent></Card>
}
