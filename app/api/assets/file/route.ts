import { NextResponse } from 'next/server'
import { readAssetFile } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const relative = searchParams.get('relative')
  if (!relative) return NextResponse.json({ error: 'Missing relative path' }, { status: 400 })
  const file = await readAssetFile(relative)
  if (!file) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'private, max-age=60',
    },
  })
}
