import { NextResponse } from 'next/server'
import { readAssets } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ assets: await readAssets() })
}
