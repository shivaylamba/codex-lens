'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, FolderOpen, Boxes, Bot, Sparkles } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { projectDisplayName } from '@/lib/decode'

const PAGES = [
  { label: 'Overview',  href: '/'         },
  { label: 'Projects',  href: '/projects'  },
  { label: 'Sessions',  href: '/sessions'  },
  { label: 'Costs',     href: '/costs'     },
  { label: 'Tools',     href: '/tools'     },
  { label: 'Activity',  href: '/activity'  },
  { label: 'History',   href: '/history'   },
  { label: 'Inventory', href: '/inventory' },
  { label: 'Config',    href: '/config'    },
  { label: 'Logs',      href: '/logs'      },
  { label: 'Assets',    href: '/assets'    },
  { label: 'Agents',    href: '/agents'    },
  { label: 'Skills',    href: '/skills'    },
  { label: 'Editable',  href: '/editable'  },
  { label: 'Settings',  href: '/settings'  },
  { label: 'Export',    href: '/export'    },
]

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sessions, setSessions] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, setProjects] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inventory, setInventory] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [agents, setAgents] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const router = useRouter()

  // Lazy-load data on first open
  useEffect(() => {
    if (!open || loaded) return
    Promise.all([
      fetch('/api/sessions').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/inventory?limit=60').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ]).then(([s, p, inv, ag]) => {
      setSessions(s.sessions ?? [])
      setProjects(p.projects ?? [])
      setInventory(inv.items ?? [])
      setAgents(ag.spawn_edges ?? [])
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [open, loaded])

  // Listen for open-search custom event (fired by TopBar button)
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-search', handler)
    return () => window.removeEventListener('open-search', handler)
  }, [])

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function navigate(href: string) {
    router.push(href)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, sessions, projects..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {PAGES.map(p => (
            <CommandItem key={p.href} value={p.label} onSelect={() => navigate(p.href)}>
              {p.href === '/skills'
                ? <Sparkles className="w-3.5 h-3.5 text-[#6366f1] shrink-0" />
                : <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {p.label}
              <CommandShortcut>page</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {sessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sessions">
              {sessions.slice(0, 80).map(s => (
                <CommandItem
                  key={s.session_id}
                  value={`${s.slug ?? ''} ${s.first_prompt ?? ''} ${projectDisplayName(s.project_path ?? '')}`}
                  onSelect={() => navigate(`/sessions/${s.session_id}`)}
                >
                  <FileText className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{s.slug ?? s.session_id.slice(0, 12)}</span>
                    {s.first_prompt && (
                      <p className="text-xs text-muted-foreground truncate">{s.first_prompt.slice(0, 60)}</p>
                    )}
                  </div>
                  <CommandShortcut>session</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map(p => (
                <CommandItem
                  key={p.slug}
                  value={`${p.display_name} ${p.slug}`}
                  onSelect={() => navigate(`/projects/${p.slug}`)}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <CommandShortcut>{p.session_count} sessions</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {inventory.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Inventory">
              {inventory.slice(0, 50).map((p, i) => (
                <CommandItem
                  key={`inventory-${i}`}
                  value={`${p.relativePath ?? ''} ${p.kind ?? ''}`}
                  onSelect={() => navigate('/inventory')}
                >
                  <Boxes className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="flex-1 truncate">{p.relativePath}</span>
                  <CommandShortcut>{p.kind}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {agents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {agents.slice(0, 40).map((m, i) => (
                <CommandItem
                  key={`agent-${i}`}
                  value={`${m.parent_thread_id ?? ''} ${m.child_thread_id ?? ''} ${m.status ?? ''}`}
                  onSelect={() => navigate('/agents')}
                >
                  <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="flex-1 truncate">{m.child_thread_id}</span>
                  <CommandShortcut>{m.status}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="border-t border-border px-3 py-2 flex items-center gap-4 text-[10px] text-muted-foreground/40 font-mono">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
        <span className="ml-auto">⌘K toggle</span>
      </div>
    </CommandDialog>
  )
}
