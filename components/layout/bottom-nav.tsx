'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, DollarSign,
  FolderOpen, Sparkles, Moon, Sun,
} from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',         label: 'Overview',  icon: LayoutDashboard },
  { href: '/sessions', label: 'Sessions',  icon: MessageSquare   },
  { href: '/costs',    label: 'Costs',     icon: DollarSign      },
  { href: '/projects', label: 'Projects',  icon: FolderOpen      },
  { href: '/skills',   label: 'Skills',    icon: Sparkles        },
]

export function BottomNav() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar/90 border-t border-sidebar-border/80 flex backdrop-blur-xl">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors',
              active ? 'text-sidebar-primary' : 'text-sidebar-foreground/48 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </Link>
        )
      })}
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors text-sidebar-foreground/48 hover:text-sidebar-foreground cursor-pointer"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span className="text-[10px] font-medium leading-none">Theme</span>
      </button>
    </nav>
  )
}
