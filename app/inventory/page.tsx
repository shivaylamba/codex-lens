'use client'

import useSWR from 'swr'
import { Boxes, File, Folder, ShieldAlert } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes, formatDateTime } from '@/lib/decode'
import type { CodexInventorySummary } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function InventoryPage() {
  const { data, error, isLoading } = useSWR<CodexInventorySummary>('/api/inventory', fetcher, { refreshInterval: 15_000 })

  return (
    <div>
      <TopBar title="Inventory" subtitle="Everything visible under ~/.codex, with sensitive files redacted" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load inventory: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric label="Storage" value={formatBytes(data.totalBytes)} />
              <Metric label="Files" value={data.totalFiles.toLocaleString()} />
              <Metric label="Directories" value={data.totalDirectories.toLocaleString()} />
              <Metric label="Root" value={data.root.replace(/^\/Users\/[^/]+/, '~')} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Boxes className="w-4 h-4" /> Categories</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.categories.map(category => (
                    <div key={category.category} className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize">{category.category}</span>
                      <span className="text-muted-foreground">{category.files.toLocaleString()} files · {formatBytes(category.bytes)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium">Path</th>
                          <th className="text-left py-2 font-medium">Category</th>
                          <th className="text-right py-2 font-medium">Size</th>
                          <th className="text-right py-2 font-medium">Modified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map(item => (
                          <tr key={item.relativePath} className="border-b border-border/60">
                            <td className="py-2 pr-4 max-w-[520px]">
                              <div className="flex items-center gap-2 min-w-0">
                                {item.kind === 'directory' ? <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                <span className="truncate">{item.relativePath}</span>
                                {item.redacted && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              </div>
                            </td>
                            <td className="py-2"><Badge variant="outline">{item.category}</Badge></td>
                            <td className="py-2 text-right text-muted-foreground">{item.kind === 'file' ? formatBytes(item.sizeBytes) : '-'}</td>
                            <td className="py-2 text-right text-muted-foreground whitespace-nowrap">{formatDateTime(item.mtime)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold truncate">{value}</p>
      </CardContent>
    </Card>
  )
}
