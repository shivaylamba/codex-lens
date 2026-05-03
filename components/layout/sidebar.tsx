'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderOpen, MessageSquare, DollarSign,
  Wrench, Activity, History, Boxes, FileCog,
  Image, Settings, Download, Moon, Sun, PanelLeftClose,
  Bot, FilePenLine, ScrollText, Sparkles,
} from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { useSidebar } from '@/components/layout/sidebar-context'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CodexLogo } from '@/components/codex-logo'

const NAV = [
  { href: '/',         label: 'Overview',  icon: LayoutDashboard },
  { href: '/projects', label: 'Projects',  icon: FolderOpen      },
  { href: '/sessions', label: 'Sessions',  icon: MessageSquare   },
  { href: '/costs',    label: 'Costs',     icon: DollarSign      },
  { href: '/tools',    label: 'Tools',     icon: Wrench          },
  { href: '/activity', label: 'Activity',  icon: Activity        },
  { href: '/history',  label: 'History',   icon: History         },
  { href: '/inventory', label: 'Inventory', icon: Boxes          },
  { href: '/config',   label: 'Config',    icon: FileCog         },
  { href: '/logs',     label: 'Logs',      icon: ScrollText      },
  { href: '/assets',   label: 'Assets',    icon: Image           },
  { href: '/agents',   label: 'Agents',    icon: Bot             },
  { href: '/skills',   label: 'Skills',    icon: Sparkles        },
  { href: '/editable', label: 'Editable',  icon: FilePenLine     },
  { href: '/settings', label: 'Settings',  icon: Settings        },
  { href: '/export',   label: 'Export',    icon: Download        },
]

function NavItem({
  href, label, icon: Icon, active, collapsed,
}: {
  href: string; label: string; icon: React.ElementType; active: boolean; collapsed: boolean
}) {
  const link = (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 rounded-full text-sm font-medium transition-all duration-200 relative',
        collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5',
        active
          ? 'text-sidebar-primary bg-sidebar-accent ring-1 ring-inset ring-sidebar-primary/20 shadow-[0_8px_22px_rgba(99,102,241,0.12)]'
          : 'text-sidebar-foreground/72 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/58',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60')} />
      {!collapsed && label}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    )
  }
  return link
}

function SidebarContents({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { theme, toggle: toggleTheme } = useTheme()
  const { toggle: toggleCollapsed } = useSidebar()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        'border-b border-sidebar-border/80 flex items-center',
        collapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 pt-5 pb-4',
      )}>
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="rounded-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <CodexLogo className="size-9" imageClassName="p-1" priority />
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <CodexLogo className="size-10" imageClassName="p-1" priority />
            <div className="min-w-0">
              <p className="text-[0.92rem] font-semibold leading-tight tracking-[-0.01em] text-sidebar-accent-foreground">
                Codex Lens
              </p>
              <p className="text-[0.7rem] leading-tight text-sidebar-foreground/48">
                Local ~/.codex
              </p>
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            className="hidden md:flex rounded-full p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-4 space-y-1 overflow-y-auto', collapsed ? 'px-1.5' : 'px-3')}>
        <TooltipProvider delayDuration={100}>
          {NAV.map(({ href, label, icon }) => (
            <div key={href} onClick={onNavigate}>
              <NavItem
                href={href}
                label={label}
                icon={icon}
                active={pathname === href}
                collapsed={collapsed}
              />
            </div>
          ))}
        </TooltipProvider>
      </nav>

      {/* Footer */}
      <div className={cn(
        'border-t border-sidebar-border/80 flex items-center',
        collapsed ? 'justify-center px-2 py-3' : 'justify-between px-4 py-3',
      )}>
        {!collapsed && (
          <a
            href="https://github.com/shivaylamba"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sidebar-foreground/52 hover:text-sidebar-foreground transition-colors"
          >
           Made by Shivay
          </a>
        )}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="rounded-full p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 h-screen flex-col border-r border-sidebar-border bg-sidebar z-40',
          'transition-[width] duration-300 overflow-hidden backdrop-blur-xl',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <SidebarContents collapsed={collapsed} />
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 p-0 bg-sidebar/95 border-sidebar-border backdrop-blur-xl">
          <SidebarContents onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
