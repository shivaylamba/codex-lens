'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Save } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { EditableFile } from '@/types/claude'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

export default function EditablePage() {
  const { data, error, isLoading } = useSWR<{ files: EditableFile[] }>('/api/editable-files', fetcher, { refreshInterval: 30_000 })
  const files = useMemo(() => data?.files ?? [], [data?.files])
  const [selectedPath, setSelectedPath] = useState('')
  const selected = useMemo(() => files.find(file => file.relativePath === (selectedPath || files[0]?.relativePath)), [files, selectedPath])
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  function choose(file: EditableFile) {
    setSelectedPath(file.relativePath)
    setDraft(file.content)
    setStatus('')
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    setStatus('')
    const res = await fetch('/api/editable-files', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relativePath: selected.relativePath, content: draft ?? selected.content }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setStatus(body.error ?? 'Save failed')
      return
    }
    setStatus('Saved with .bak backup')
    await mutate('/api/editable-files')
  }

  const editorValue = draft ?? selected?.content ?? ''

  return (
    <div>
      <TopBar title="Editable" subtitle="Guarded edits for AGENTS.md, rules/*.rules, and memories/*.md" />
      <main className="px-6 py-6 space-y-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load editable files: {String(error)}</p>}
        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Files</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {files.map(file => (
                  <button
                    key={file.relativePath}
                    onClick={() => choose(file)}
                    className={`w-full rounded-md border border-border px-3 py-2 text-left transition-colors ${selected?.relativePath === file.relativePath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{file.relativePath}</span>
                      <Badge variant="outline">{file.kind}</Badge>
                    </div>
                  </button>
                ))}
                {!files.length && <p className="text-sm text-muted-foreground">No editable Codex files found.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base truncate">{selected?.relativePath ?? 'No file selected'}</CardTitle>
                  <Button onClick={save} disabled={!selected || saving} size="sm" className="gap-2">
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving' : 'Save'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={editorValue}
                  onChange={event => setDraft(event.target.value)}
                  className="min-h-[560px] w-full resize-y rounded-lg border border-[#1f2937] bg-[#0b0f19] p-4 font-mono text-sm leading-6 text-[#e5e7eb] outline-none focus:ring-2 focus:ring-ring/35"
                  spellCheck={false}
                  disabled={!selected}
                />
                {status && <p className="text-xs text-muted-foreground">{status}</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
