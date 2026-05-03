import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { ThemeProvider } from '@/components/theme-provider'
import { KeyboardNavProvider } from '@/components/keyboard-nav-provider'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { ClientLayout } from '@/components/layout/client-layout'

export const metadata: Metadata = {
  title: 'Codex Lens',
  description: 'Local Codex analytics and inventory. Reads directly from ~/.codex/',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        <ThemeProvider>
          <SidebarProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <ClientLayout>{children}</ClientLayout>
            </div>
            <BottomNav />
            <KeyboardNavProvider />
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
