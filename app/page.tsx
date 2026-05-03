import { TopBar } from '@/components/layout/top-bar'
import { OverviewClient } from './overview-client'

export default function OverviewPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title="Codex Lens"
        subtitle="Local analytics for ~/.codex sessions, tools, config, logs, and assets"
      />
      <OverviewClient />
    </div>
  )
}
