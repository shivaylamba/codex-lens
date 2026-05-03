import { NextResponse } from 'next/server'
import { readEditableFiles, writeEditableFile } from '@/lib/codex-reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  const files = await readEditableFiles()
  return NextResponse.json({ memories: files.filter(f => f.kind === 'memory'), files })
}

export async function PATCH(req: Request) {
  const { relativePath, file, content } = await req.json().catch(() => ({})) as {
    relativePath?: string
    file?: string
    content?: string
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  }
  const ok = await writeEditableFile(relativePath ?? file ?? '', content)
  if (!ok) return NextResponse.json({ error: 'File is not editable by Codex Lens' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
