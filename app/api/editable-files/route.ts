import { NextResponse } from 'next/server'
import { readEditableFiles, writeEditableFile } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ files: await readEditableFiles() })
}

export async function PATCH(req: Request) {
  const { relativePath, content } = await req.json().catch(() => ({})) as {
    relativePath?: string
    content?: string
  }
  if (!relativePath || typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing relativePath or content' }, { status: 400 })
  }
  const ok = await writeEditableFile(relativePath, content)
  if (!ok) return NextResponse.json({ error: 'File is not editable by Codex Lens' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
