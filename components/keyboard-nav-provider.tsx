'use client'

import { GlobalSearch } from './global-search'
import { useGlobalKeyboardNav } from './use-global-keyboard-nav'

function GModeIndicator() {
  const gMode = useGlobalKeyboardNav()
  if (!gMode) return null
  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 z-50 rounded-full border border-border/80 bg-card/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-xl animate-in fade-in-0 duration-100 pointer-events-none">
      g —
    </div>
  )
}

export function KeyboardNavProvider() {
  return (
    <>
      <GlobalSearch />
      <GModeIndicator />
    </>
  )
}
