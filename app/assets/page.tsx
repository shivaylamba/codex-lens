'use client'

import Image from 'next/image'
import useSWR from 'swr'
import { ImageIcon } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes, formatDateTime } from '@/lib/decode'
import type { CodexAsset } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function AssetsPage() {
  const { data, error, isLoading } = useSWR<{ assets: CodexAsset[] }>('/api/assets', fetcher, { refreshInterval: 30_000 })
  const assets = data?.assets ?? []
  const imageAssets = assets.filter(asset => asset.href)

  return (
    <div>
      <TopBar title="Assets" subtitle="Generated images, pets, shell snapshots, and ambient suggestions" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load assets: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric label="Assets" value={assets.length.toLocaleString()} />
              <Metric label="Images" value={imageAssets.length.toLocaleString()} />
              <Metric label="Snapshots" value={assets.filter(a => a.kind === 'snapshot').length.toLocaleString()} />
              <Metric label="Suggestions" value={assets.filter(a => a.kind === 'suggestion').length.toLocaleString()} />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Image Assets</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {imageAssets.map(asset => (
                    <div key={asset.relativePath} className="rounded-md border border-border overflow-hidden bg-card">
                      <div className="relative aspect-square bg-muted">
                        <Image src={asset.href!} alt={asset.title} fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{asset.title}</p>
                          <Badge variant="outline">{asset.kind}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{asset.relativePath}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">All Assets</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium">Path</th>
                        <th className="text-left py-2 font-medium">Kind</th>
                        <th className="text-right py-2 font-medium">Size</th>
                        <th className="text-right py-2 font-medium">Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map(asset => (
                        <tr key={asset.relativePath} className="border-b border-border/60">
                          <td className="py-2 pr-4 max-w-[680px] truncate">{asset.relativePath}</td>
                          <td className="py-2"><Badge variant="outline">{asset.kind}</Badge></td>
                          <td className="py-2 text-right text-muted-foreground">{formatBytes(asset.sizeBytes)}</td>
                          <td className="py-2 text-right text-muted-foreground whitespace-nowrap">{formatDateTime(asset.mtime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
