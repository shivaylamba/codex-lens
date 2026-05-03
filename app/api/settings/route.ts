import { NextResponse } from 'next/server'
import { getCodexStorageBytes, readConfigSummary, readInstalledPlugins, readSettings, readSkills } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [settings, storageBytes, skills, plugins, config] = await Promise.all([
    readSettings(),
    getCodexStorageBytes(),
    readSkills(),
    readInstalledPlugins(),
    readConfigSummary(),
  ])
  return NextResponse.json({ settings, storageBytes, skills, plugins, config })
}
