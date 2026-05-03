'use client'

import { useMemo, useState } from 'react'
import type { ElementType } from 'react'
import useSWR from 'swr'
import { Package, Puzzle, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { CodexSkillSummary } from '@/types/claude'

interface SkillsResponse {
  skills: CodexSkillSummary[]
}

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
})

const SOURCE_META: Record<CodexSkillSummary['source'], { label: string; icon: ElementType }> = {
  user: { label: 'User skills', icon: Sparkles },
  system: { label: 'Internal skills', icon: ShieldCheck },
  plugin: { label: 'Plugin skills', icon: Puzzle },
  external: { label: 'External skills', icon: Package },
}

const SOURCE_ORDER: CodexSkillSummary['source'][] = ['user', 'system', 'plugin', 'external']

export default function SkillsPage() {
  const [query, setQuery] = useState('')
  const { data, error, isLoading } = useSWR<SkillsResponse>('/api/skills', fetcher, { refreshInterval: 30_000 })
  const skills = useMemo(() => data?.skills ?? [], [data?.skills])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(skill =>
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.sourceLabel.toLowerCase().includes(q) ||
      skill.relativePath.toLowerCase().includes(q)
    )
  }, [query, skills])

  const grouped = useMemo(() => {
    return SOURCE_ORDER.map(source => ({
      source,
      skills: filtered.filter(skill => skill.source === source),
    })).filter(group => group.skills.length > 0)
  }, [filtered])

  return (
    <div>
      <TopBar title="Skills" subtitle="Internal, plugin, user, and external Codex skills discovered from local skill folders" />
      <main className="space-y-6 px-4 py-5 md:px-6 md:py-6">
        {isLoading && <Skeleton className="h-96 rounded-lg" />}
        {error && <p className="text-sm text-destructive">Failed to load skills: {String(error)}</p>}
        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="All Skills" value={skills.length.toLocaleString()} />
              <Metric label="Internal" value={skills.filter(s => s.source === 'system').length.toLocaleString()} />
              <Metric label="Plugin" value={skills.filter(s => s.source === 'plugin').length.toLocaleString()} />
              <Metric label="External" value={skills.filter(s => s.source === 'external').length.toLocaleString()} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="size-4" />
                  Search Skills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search by name, source, description, or path..."
                  className="max-w-2xl"
                />
              </CardContent>
            </Card>

            <div className="space-y-6">
              {grouped.map(({ source, skills: groupSkills }) => {
                const meta = SOURCE_META[source]
                const Icon = meta.icon
                return (
                  <Card key={source} className="min-w-0">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3 text-base">
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0" />
                          {meta.label}
                        </span>
                        <Badge variant="outline">{groupSkills.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {groupSkills.map(skill => (
                          <SkillCard key={skill.path} skill={skill} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
              {!filtered.length && (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No skills match this search.
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function SkillCard({ skill }: { skill: CodexSkillSummary }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-card/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{skill.name}</p>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            {skill.description || 'No description in SKILL.md.'}
          </p>
        </div>
        {skill.version && <Badge variant="outline">v{skill.version}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={skill.source === 'user' ? 'default' : 'secondary'}>
          {skill.source}
        </Badge>
        <Badge variant="outline" className="max-w-full truncate">
          {skill.sourceLabel}
        </Badge>
        {skill.userInvocable !== undefined && (
          <Badge variant="outline">
            {skill.userInvocable ? 'user-invocable' : 'internal trigger'}
          </Badge>
        )}
      </div>
      <p className="mt-3 break-all font-mono text-[11px] leading-5 text-muted-foreground/70">
        {skill.relativePath}
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
