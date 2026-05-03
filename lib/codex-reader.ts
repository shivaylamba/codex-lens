import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  CodexAgentSummary,
  CodexAsset,
  CodexConfigSummary,
  CodexInventoryItem,
  CodexInventorySummary,
  CodexLogSummary,
  CodexSkillSummary,
  DailyActivity,
  EditableFile,
  HistoryEntry,
  ProjectSummary,
  ReplayData,
  ReplayTurn,
  SessionMeta,
  StatsCache,
  ToolCall,
  ToolsAnalytics,
  VersionRecord,
} from '@/types/claude'
import { estimateCostFromUsage } from '@/lib/pricing'
import { pathToSlug, projectDisplayName } from '@/lib/decode'
import { categorizeTool, isMcpTool, parseMcpTool } from '@/lib/tool-categories'

const execFileAsync = promisify(execFile)

const CODEX_DIR = process.env.CODEX_CONFIG_DIR ?? path.join(os.homedir(), '.codex')
const MAX_PREVIEW_BYTES = 80_000
const MAX_INVENTORY_ITEMS = 5_000
const MAX_FALLBACK_ROLLOUTS = Number(process.env.CODEX_LENS_MAX_FALLBACK_ROLLOUTS ?? 500)
const MAX_REPLAY_EVENTS = Number(process.env.CODEX_LENS_MAX_REPLAY_EVENTS ?? 25_000)

type AnyRecord = Record<string, unknown>

interface ThreadRow {
  id: string
  rollout_path?: string
  created_at?: number
  updated_at?: number
  created_at_ms?: number
  updated_at_ms?: number
  source?: string
  model_provider?: string
  cwd?: string
  title?: string
  sandbox_policy?: string
  approval_mode?: string
  tokens_used?: number
  archived?: number
  git_sha?: string
  git_branch?: string
  git_origin_url?: string
  cli_version?: string
  first_user_message?: string
  agent_nickname?: string
  agent_role?: string
  memory_mode?: string
  model?: string
  reasoning_effort?: string
  agent_path?: string
}

interface RolloutParse {
  meta: SessionMeta | null
  replay: ReplayData
}

interface SessionReadOptions {
  limit?: number
  offset?: number
  includeRolloutFallback?: boolean
}

export function codexPath(...segments: string[]): string {
  return path.join(CODEX_DIR, ...segments)
}

const AGENTS_SKILLS_DIR = path.join(os.homedir(), '.agents', 'skills')

function isoFromMs(ms?: number): string {
  if (!ms || Number.isNaN(ms)) return ''
  return new Date(ms).toISOString()
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function parseMaybeJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string' || !raw.trim()) return {}
  const parsed = safeJsonParse(raw)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item
      const rec = asRecord(item)
      return extractText(rec.text ?? rec.content ?? rec.message)
    }).filter(Boolean).join('\n')
  }
  const rec = asRecord(value)
  if (typeof rec.text === 'string') return rec.text
  if (typeof rec.message === 'string') return rec.message
  if (typeof rec.content === 'string') return rec.content
  if (Array.isArray(rec.content)) return extractText(rec.content)
  return ''
}

function stripSensitiveText(text: string): string {
  return text
    .replace(/(bearer_token_env_var\s*=\s*)("[^"]+"|'[^']+'|\S+)/gi, '$1"[redacted]"')
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|password)(["'\s:=]+)([^"'\s,}]+)/gi, '$1$2[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]')
    .replace(/gh[pousr]_[A-Za-z0-9_]{12,}/g, 'gh_[redacted]')
}

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function fileCategory(relativePath: string, isDir: boolean): string {
  const top = relativePath.split(path.sep)[0] || '.'
  if (relativePath === 'auth.json' || relativePath === 'installation_id') return 'secrets'
  if (top === 'sessions') return 'sessions'
  if (relativePath.endsWith('.sqlite') || relativePath.endsWith('.sqlite-wal') || relativePath.endsWith('.sqlite-shm')) return 'sqlite'
  if (top === 'log' || relativePath.startsWith('logs_')) return 'logs'
  if (top === 'generated_images' || top === 'pets') return 'assets'
  if (top === 'plugins' || top === 'skills' || top === 'vendor_imports') return 'extensions'
  if (top === 'cache' || top === '.tmp' || top === 'tmp') return 'cache'
  if (top === 'rules' || relativePath === 'AGENTS.md' || top === 'memories') return 'editable'
  return isDir ? 'directory' : 'file'
}

function isSensitiveRelativePath(relativePath: string): boolean {
  const base = path.basename(relativePath).toLowerCase()
  return (
    base === 'auth.json' ||
    base === 'installation_id' ||
    base.includes('key') ||
    base.includes('token') ||
    relativePath.includes('device_key') ||
    relativePath.includes('remote_control_enrollments')
  )
}

function isPreviewable(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase()
  return ['.json', '.jsonl', '.toml', '.md', '.txt', '.rules', '.log', '.sh', '.csv'].includes(ext)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function listFilesRecursive(root: string, predicate?: (filePath: string) => boolean): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries: Array<import('fs').Dirent> = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    await Promise.all(entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (!predicate || predicate(full)) {
        out.push(full)
      }
    }))
  }
  await walk(root)
  return out.sort()
}

async function sqliteRows<T extends object>(dbPath: string, sql: string): Promise<T[]> {
  if (!await fileExists(dbPath)) return []
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', dbPath, sql], {
      timeout: 8_000,
      maxBuffer: 20 * 1024 * 1024,
    })
    if (!stdout.trim()) return []
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

async function readThreads(): Promise<ThreadRow[]> {
  return sqliteRows<ThreadRow>(codexPath('state_5.sqlite'), `
    select id, rollout_path, created_at, updated_at, created_at_ms, updated_at_ms,
           source, model_provider, cwd, title, sandbox_policy, approval_mode,
           tokens_used, archived, git_sha, git_branch, git_origin_url, cli_version,
           first_user_message, agent_nickname, agent_role, memory_mode, model,
           reasoning_effort, agent_path
    from threads
    order by updated_at_ms desc
  `)
}

async function rolloutFiles(): Promise<string[]> {
  return listFilesRecursive(codexPath('sessions'), file => file.endsWith('.jsonl'))
}

async function rolloutFilesByMtime(limit = MAX_FALLBACK_ROLLOUTS, offset = 0): Promise<string[]> {
  const files = await rolloutFiles()
  const withStats = await Promise.all(files.map(async file => {
    try {
      const stat = await fs.stat(file)
      return { file, mtimeMs: stat.mtimeMs }
    } catch {
      return { file, mtimeMs: 0 }
    }
  }))
  return withStats
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(offset, offset + limit)
    .map(item => item.file)
}

function sessionIdFromPath(filePath: string): string {
  const base = path.basename(filePath, '.jsonl')
  const match = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  return match?.[1] ?? base.replace(/^rollout-/, '')
}

async function readRolloutLines(filePath: string): Promise<AnyRecord[]> {
  const lines: AnyRecord[] = []
  try {
    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })
    for await (const line of rl) {
      if (!line.trim()) continue
      const parsed = safeJsonParse<AnyRecord>(line)
      if (parsed) lines.push(parsed)
      if (lines.length >= MAX_REPLAY_EVENTS) {
        rl.close()
        break
      }
    }
    return lines
  } catch {
    return []
  }
}

async function readSessionIndex(): Promise<SessionMeta[]> {
  const indexPath = codexPath('session_index.jsonl')
  if (!await fileExists(indexPath)) return []
  const sessions: SessionMeta[] = []
  try {
    const rl = readline.createInterface({
      input: createReadStream(indexPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })
    for await (const line of rl) {
      if (!line.trim()) continue
      const row = safeJsonParse<AnyRecord>(line)
      if (!row) continue
      const meta = sessionIndexRowToMeta(row)
      if (meta) sessions.push(meta)
    }
  } catch {
    return []
  }
  return sessions.sort((a, b) => b.start_time.localeCompare(a.start_time))
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return 0
}

function isoFromUnknown(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000
    return isoFromMs(ms)
  }
  return ''
}

function sessionIndexRowToMeta(row: AnyRecord): SessionMeta | null {
  const sessionId = firstString(row.session_id, row.id, row.sessionId, row.thread_id, row.threadId)
  if (!sessionId) return null
  const startTime =
    isoFromUnknown(row.start_time) ||
    isoFromUnknown(row.created_at) ||
    isoFromUnknown(row.created_at_ms) ||
    isoFromUnknown(row.timestamp) ||
    isoFromUnknown(row.updated_at) ||
    isoFromUnknown(row.updated_at_ms)
  if (!startTime) return null
  const endTime =
    isoFromUnknown(row.end_time) ||
    isoFromUnknown(row.updated_at) ||
    isoFromUnknown(row.updated_at_ms) ||
    startTime
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const rolloutPath = firstString(row.rollout_path, row.path, row.file_path, row.file)
  const projectPath = firstString(row.cwd, row.project_path, row.projectPath, row.workspace, row.source) || 'Unknown'
  const userMessages = firstNumber(row.user_message_count, row.user_messages, row.messages, row.message_count)
  const assistantMessages = firstNumber(row.assistant_message_count, row.assistant_messages)
  const inputTokens = firstNumber(row.input_tokens, row.tokens_used, row.total_input_tokens)
  const outputTokens = firstNumber(row.output_tokens, row.total_output_tokens)
  const cacheReadTokens = firstNumber(row.cache_read_input_tokens, row.cached_input_tokens)
  const reasoningTokens = firstNumber(row.reasoning_output_tokens)
  return {
    session_id: sessionId,
    project_path: projectPath,
    start_time: startTime,
    duration_minutes: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 60_000) : 0,
    user_message_count: userMessages,
    assistant_message_count: assistantMessages,
    tool_counts: parseMaybeJsonObject(row.tool_counts) as Record<string, number>,
    languages: {},
    git_commits: 0,
    git_pushes: 0,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: firstNumber(row.cache_creation_input_tokens),
    cache_read_input_tokens: cacheReadTokens,
    reasoning_output_tokens: reasoningTokens,
    first_prompt: truncate(firstString(row.first_prompt, row.first_user_message, row.title)),
    user_interruptions: 0,
    user_response_times: [],
    tool_errors: firstNumber(row.tool_errors),
    tool_error_categories: {},
    uses_task_agent: !!row.agent_nickname || !!row.agent_role,
    uses_mcp: false,
    uses_web_search: false,
    uses_web_fetch: false,
    lines_added: 0,
    lines_removed: 0,
    files_modified: 0,
    message_hours: [new Date(startTime).getHours()],
    user_message_timestamps: [startTime],
    model: firstString(row.model),
    model_provider: firstString(row.model_provider),
    source: firstString(row.source),
    cli_version: firstString(row.cli_version, row.version),
    git_branch: firstString(row.git_branch),
    sandbox_policy: firstString(row.sandbox_policy),
    approval_mode: firstString(row.approval_mode),
    archived: !!row.archived,
    rollout_path: rolloutPath ? path.resolve(CODEX_DIR, rolloutPath) : undefined,
    title: firstString(row.title),
    reasoning_effort: firstString(row.reasoning_effort),
    agent_nickname: firstString(row.agent_nickname),
    agent_role: firstString(row.agent_role),
    memory_mode: firstString(row.memory_mode),
  }
}

function eventPayload(line: AnyRecord): AnyRecord {
  return asRecord(line.payload)
}

function lineTimestamp(line: AnyRecord): string {
  return typeof line.timestamp === 'string' ? line.timestamp : ''
}

function buildToolCall(payload: AnyRecord): ToolCall | null {
  const type = String(payload.type ?? '')
  const name =
    typeof payload.name === 'string' ? payload.name :
    type === 'web_search_call' ? 'web_search' :
    type === 'image_generation_call' ? 'image_generation' :
    type === 'tool_search_call' ? 'tool_search' :
    ''
  if (!name) return null
  return {
    id: String(payload.call_id ?? payload.id ?? `${name}-${Math.random().toString(36).slice(2)}`),
    name,
    input: parseMaybeJsonObject(payload.arguments ?? payload.input),
  }
}

function usageFromTokenInfo(info: AnyRecord): {
  total: number
  last: number
  input: number
  output: number
  cached: number
  reasoning: number
} {
  const total = asRecord(info.total_token_usage)
  const last = asRecord(info.last_token_usage)
  return {
    total: num(total.total_tokens),
    last: num(last.total_tokens),
    input: num(total.input_tokens),
    output: num(total.output_tokens),
    cached: num(total.cached_input_tokens),
    reasoning: num(total.reasoning_output_tokens),
  }
}

async function parseRollout(filePath: string, thread?: ThreadRow): Promise<RolloutParse> {
  const lines = await readRolloutLines(filePath)
  const fallbackId = sessionIdFromPath(filePath)
  const turns: ReplayTurn[] = []
  const toolCounts: Record<string, number> = {}
  const toolErrorCategories: Record<string, number> = {}
  const messageHours: number[] = []
  const userMessageTimestamps: string[] = []
  const compactions: ReplayData['compactions'] = []
  const summaries: ReplayData['summaries'] = []

  let sessionId = thread?.id ?? fallbackId
  let cwd = thread?.cwd ?? ''
  let source = thread?.source ?? ''
  let cliVersion = thread?.cli_version ?? ''
  let modelProvider = thread?.model_provider ?? ''
  let model = thread?.model ?? ''
  let reasoningEffort = thread?.reasoning_effort ?? ''
  const gitBranch = thread?.git_branch ?? ''
  let startTime = thread?.created_at_ms ? isoFromMs(thread.created_at_ms) : ''
  let lastTime = thread?.updated_at_ms ? isoFromMs(thread.updated_at_ms) : ''
  let userCount = 0
  let assistantCount = 0
  let firstPrompt = thread?.first_user_message ?? ''
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let reasoningTokens = 0
  let hasTaskAgent = false
  let hasMcp = false
  let hasWebSearch = false
  const hasWebFetch = false
  let totalCost = 0
  let turnIndex = 0

  for (const line of lines) {
    const ts = lineTimestamp(line)
    if (ts) {
      if (!startTime) startTime = ts
      lastTime = ts
    }

    const payload = eventPayload(line)
    const payloadType = String(payload.type ?? '')

    if (line.type === 'session_meta') {
      if (!thread && typeof payload.id === 'string') sessionId = payload.id
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.source === 'string') source = payload.source
      if (typeof payload.cli_version === 'string') cliVersion = payload.cli_version
      if (typeof payload.model_provider === 'string') modelProvider = payload.model_provider
      continue
    }

    if (line.type === 'turn_context') {
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.model === 'string') model = payload.model
      if (typeof payload.effort === 'string') reasoningEffort = payload.effort
      continue
    }

    if (payloadType === 'token_count') {
      const usage = usageFromTokenInfo(asRecord(payload.info))
      if (usage.total || usage.input || usage.output || usage.cached) {
        inputTokens = Math.max(inputTokens, usage.input)
        outputTokens = Math.max(outputTokens, usage.output)
        cacheReadTokens = Math.max(cacheReadTokens, usage.cached)
        reasoningTokens = Math.max(reasoningTokens, usage.reasoning)
      }
      continue
    }

    if (payloadType === 'context_compacted' || line.type === 'compacted') {
      compactions.push({
        uuid: `${sessionId}-compact-${compactions.length + 1}`,
        timestamp: ts,
        trigger: 'auto',
        pre_tokens: inputTokens + outputTokens + cacheReadTokens,
        turn_index: turnIndex,
        summary: extractText(payload.summary ?? payload.content),
      })
      continue
    }

    if (payloadType === 'user_message') {
      const text = extractText(payload.message ?? payload.content ?? payload.text_elements)
      userCount++
      if (!firstPrompt && text) firstPrompt = truncate(text)
      if (ts) {
        const d = new Date(ts)
        if (!Number.isNaN(d.getTime())) {
          messageHours.push(d.getHours())
          userMessageTimestamps.push(ts)
        }
      }
      turns.push({
        uuid: `${sessionId}-user-${turnIndex}`,
        parentUuid: null,
        type: 'user',
        timestamp: ts,
        text,
        event_type: payloadType,
      })
      turnIndex++
      continue
    }

    if (payloadType === 'agent_message' || payloadType === 'message') {
      const role = String(payload.role ?? '')
      const text = extractText(payload.content ?? payload.message)
      if (role === 'user') {
        userCount++
        if (!firstPrompt && text) firstPrompt = truncate(text)
        if (ts) {
          const d = new Date(ts)
          if (!Number.isNaN(d.getTime())) {
            messageHours.push(d.getHours())
            userMessageTimestamps.push(ts)
          }
        }
        turns.push({ uuid: `${sessionId}-user-${turnIndex}`, parentUuid: null, type: 'user', timestamp: ts, text, event_type: payloadType })
      } else {
        assistantCount++
        turns.push({ uuid: `${sessionId}-assistant-${turnIndex}`, parentUuid: null, type: 'assistant', timestamp: ts, model, text, event_type: payloadType })
      }
      turnIndex++
      continue
    }

    if (payloadType === 'reasoning' || payloadType === 'agent_reasoning') {
      const text = extractText(payload.summary ?? payload.content)
      turns.push({
        uuid: `${sessionId}-reasoning-${turnIndex}`,
        parentUuid: null,
        type: 'assistant',
        timestamp: ts,
        model,
        text: '',
        has_thinking: true,
        thinking_text: text,
        event_type: payloadType,
      })
      turnIndex++
      continue
    }

    if (
      payloadType === 'function_call' ||
      payloadType === 'custom_tool_call' ||
      payloadType === 'image_generation_call' ||
      payloadType === 'web_search_call' ||
      payloadType === 'tool_search_call'
    ) {
      const call = buildToolCall(payload)
      if (!call) continue
      toolCounts[call.name] = (toolCounts[call.name] ?? 0) + 1
      if (call.name === 'spawn_agent' || call.name === 'wait_agent' || call.name === 'close_agent' || payloadType === 'custom_tool_call') hasTaskAgent = true
      if (isMcpTool(call.name) || payloadType === 'custom_tool_call') hasMcp = isMcpTool(call.name) || call.name.startsWith('mcp__') || hasMcp
      if (call.name.includes('web_search') || payloadType === 'web_search_call') hasWebSearch = true
      turns.push({
        uuid: `${sessionId}-tool-${turnIndex}`,
        parentUuid: null,
        type: 'assistant',
        timestamp: ts,
        model,
        tool_calls: [call],
        event_type: payloadType,
      })
      turnIndex++
      continue
    }

    if (
      payloadType === 'function_call_output' ||
      payloadType === 'custom_tool_call_output' ||
      payloadType === 'exec_command_end' ||
      payloadType === 'patch_apply_end' ||
      payloadType === 'web_search_end' ||
      payloadType === 'image_generation_end' ||
      payloadType === 'mcp_tool_call_end' ||
      payloadType === 'tool_search_output'
    ) {
      const callId = String(payload.call_id ?? payload.id ?? `${payloadType}-${turnIndex}`)
      const isError = payload.status === 'error' || num(payload.exit_code) !== 0 || payload.is_error === true
      const content = truncate(stripSensitiveText(
        extractText(payload.formatted_output ?? payload.aggregated_output ?? payload.output ?? payload.stdout ?? payload.stderr ?? payload.error ?? payload)
      ), 2_000)
      if (payloadType === 'mcp_tool_call_end') hasMcp = true
      if (payloadType === 'web_search_end') hasWebSearch = true
      if (payloadType === 'exec_command_end' && isError) {
        toolErrorCategories.shell = (toolErrorCategories.shell ?? 0) + 1
      }
      turns.push({
        uuid: `${sessionId}-result-${turnIndex}`,
        parentUuid: null,
        type: 'user',
        timestamp: ts,
        text: '',
        tool_results: [{ tool_use_id: callId, content, is_error: isError }],
        event_type: payloadType,
      })
      turnIndex++
    }
  }

  const start = new Date(startTime).getTime()
  const end = new Date(lastTime || startTime).getTime()
  const durationMinutes = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, (end - start) / 60_000)
    : 0

  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cacheReadTokens,
    reasoning_output_tokens: reasoningTokens,
    total_tokens: inputTokens + outputTokens + cacheReadTokens,
  }

  if (model) totalCost = estimateCostFromUsage(model, usage)

  const meta: SessionMeta | null = startTime ? {
    session_id: sessionId,
    project_path: cwd || thread?.cwd || 'Unknown',
    start_time: startTime,
    duration_minutes: durationMinutes,
    user_message_count: userCount,
    assistant_message_count: assistantCount,
    tool_counts: toolCounts,
    languages: {},
    git_commits: 0,
    git_pushes: 0,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cacheReadTokens,
    reasoning_output_tokens: reasoningTokens,
    first_prompt: truncate(firstPrompt || thread?.title || ''),
    user_interruptions: lines.filter(l => eventPayload(l).type === 'turn_aborted').length,
    user_response_times: [],
    tool_errors: Object.values(toolErrorCategories).reduce((a, b) => a + b, 0),
    tool_error_categories: toolErrorCategories,
    uses_task_agent: hasTaskAgent,
    uses_mcp: hasMcp,
    uses_web_search: hasWebSearch,
    uses_web_fetch: hasWebFetch,
    lines_added: 0,
    lines_removed: 0,
    files_modified: 0,
    message_hours: messageHours,
    user_message_timestamps: userMessageTimestamps,
    model,
    model_provider: modelProvider,
    source,
    cli_version: cliVersion,
    git_branch: gitBranch,
    sandbox_policy: thread?.sandbox_policy,
    approval_mode: thread?.approval_mode,
    archived: !!thread?.archived,
    rollout_path: filePath,
    title: thread?.title,
    reasoning_effort: reasoningEffort,
    agent_nickname: thread?.agent_nickname,
    agent_role: thread?.agent_role,
    memory_mode: thread?.memory_mode,
  } : null

  return {
    meta,
    replay: {
      session_id: sessionId,
      slug: cwd ? pathToSlug(cwd) : undefined,
      version: cliVersion,
      git_branch: gitBranch,
      turns: turns.map(t => t.usage ? t : t.type === 'assistant' && t.text ? { ...t, usage } : t),
      compactions,
      summaries,
      total_cost: totalCost,
      raw_event_count: lines.length,
    },
  }
}

export async function getSessions(options: SessionReadOptions = {}): Promise<SessionMeta[]> {
  const { limit, offset = 0, includeRolloutFallback = true } = options
  const [threads, indexSessions] = await Promise.all([readThreads(), readSessionIndex()])

  const fromThreads = threads.map(threadToSessionMeta).filter(Boolean) as SessionMeta[]
  const byId = new Map<string, SessionMeta>()
  for (const session of [...indexSessions, ...fromThreads]) {
    byId.set(session.session_id, { ...(byId.get(session.session_id) ?? {}), ...session })
  }

  if (byId.size) {
    const sorted = [...byId.values()].sort((a, b) => b.start_time.localeCompare(a.start_time))
    return typeof limit === 'number' ? sorted.slice(offset, offset + limit) : sorted
  }

  if (!includeRolloutFallback) return []

  const files = await rolloutFilesByMtime(limit ?? MAX_FALLBACK_ROLLOUTS, offset)
  const threadsForRollout = threads
  const threadById = new Map(threads.map(t => [t.id, t]))
  const threadByRollout = new Map(threadsForRollout.filter(t => t.rollout_path).map(t => [path.resolve(CODEX_DIR, t.rollout_path!), t]))
  const fromRollouts: SessionMeta[] = []

  for (const file of files) {
    const id = sessionIdFromPath(file)
    const thread = threadById.get(id) ?? threadByRollout.get(file)
    const parsed = await parseRollout(file, thread)
    if (parsed.meta) fromRollouts.push(parsed.meta)
  }

  return fromRollouts.sort((a, b) => b.start_time.localeCompare(a.start_time))
}

function threadToSessionMeta(t: ThreadRow): SessionMeta | null {
  const startTime = isoFromMs(t.created_at_ms ?? (t.created_at ? t.created_at * 1000 : 0))
  if (!startTime) return null
  const endTime = isoFromMs(t.updated_at_ms ?? (t.updated_at ? t.updated_at * 1000 : 0))
  const start = new Date(startTime).getTime()
  const end = new Date(endTime || startTime).getTime()
  return {
    session_id: t.id,
    project_path: t.cwd ?? 'Unknown',
    start_time: startTime,
    duration_minutes: Math.max(0, (end - start) / 60_000),
    user_message_count: t.first_user_message ? 1 : 0,
    assistant_message_count: 0,
    tool_counts: {},
    languages: {},
    git_commits: 0,
    git_pushes: 0,
    input_tokens: t.tokens_used ?? 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    first_prompt: truncate(t.first_user_message || t.title || ''),
    user_interruptions: 0,
    user_response_times: [],
    tool_errors: 0,
    tool_error_categories: {},
    uses_task_agent: !!t.agent_nickname || !!t.agent_role,
    uses_mcp: false,
    uses_web_search: false,
    uses_web_fetch: false,
    lines_added: 0,
    lines_removed: 0,
    files_modified: 0,
    message_hours: [new Date(startTime).getHours()],
    user_message_timestamps: [startTime],
    model: t.model,
    model_provider: t.model_provider,
    source: t.source,
    cli_version: t.cli_version,
    git_branch: t.git_branch,
    sandbox_policy: t.sandbox_policy,
    approval_mode: t.approval_mode,
    archived: !!t.archived,
    rollout_path: t.rollout_path ? path.resolve(CODEX_DIR, t.rollout_path) : undefined,
    title: t.title,
    reasoning_effort: t.reasoning_effort,
    agent_nickname: t.agent_nickname,
    agent_role: t.agent_role,
    memory_mode: t.memory_mode,
  }
}

export async function readSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  return (await getSessions()).find(s => s.session_id === sessionId) ?? null
}

export async function findSessionJSONL(sessionId: string): Promise<string | null> {
  const files = await rolloutFiles()
  return files.find(file => sessionIdFromPath(file) === sessionId || path.basename(file).includes(sessionId)) ?? null
}

export async function parseSessionReplay(jsonlPath: string, sessionId: string): Promise<ReplayData> {
  const thread = (await readThreads()).find(t => t.id === sessionId)
  return (await parseRollout(jsonlPath, thread)).replay
}

export async function readStatsCache(): Promise<StatsCache> {
  const sessions = await getSessions()
  const dailyActivity = computeDailyActivityFromSessions(sessions)
  const modelUsage: StatsCache['modelUsage'] = {}
  const dailyModelTokensMap = new Map<string, Record<string, number>>()
  const hourCounts: Record<string, number> = {}

  for (const s of sessions) {
    const model = s.model || 'unknown'
    const usage = modelUsage[model] ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      reasoningOutputTokens: 0,
      costUSD: 0,
      webSearchRequests: 0,
    }
    usage.inputTokens += s.input_tokens ?? 0
    usage.outputTokens += s.output_tokens ?? 0
    usage.cacheReadInputTokens += s.cache_read_input_tokens ?? 0
    usage.cacheCreationInputTokens += s.cache_creation_input_tokens ?? 0
    usage.reasoningOutputTokens = (usage.reasoningOutputTokens ?? 0) + (s.reasoning_output_tokens ?? 0)
    usage.webSearchRequests += s.tool_counts.web_search ?? s.tool_counts.web_search_call ?? 0
    modelUsage[model] = usage

    const date = s.start_time.slice(0, 10)
    const day = dailyModelTokensMap.get(date) ?? {}
    day[model] = (day[model] ?? 0) + (s.input_tokens ?? 0) + (s.output_tokens ?? 0) + (s.cache_read_input_tokens ?? 0)
    dailyModelTokensMap.set(date, day)

    for (const hour of s.message_hours) {
      hourCounts[String(hour)] = (hourCounts[String(hour)] ?? 0) + 1
    }
  }

  let longest = sessions[0]
  for (const s of sessions) {
    if (!longest || s.duration_minutes > longest.duration_minutes) longest = s
  }

  return {
    version: 1,
    lastComputedDate: new Date().toISOString(),
    dailyActivity,
    tokensByDate: [...dailyModelTokensMap.entries()].map(([date, tokensByModel]) => ({ date, tokensByModel })).sort((a, b) => a.date.localeCompare(b.date)),
    dailyModelTokens: [...dailyModelTokensMap.entries()].map(([date, tokensByModel]) => ({ date, tokensByModel })).sort((a, b) => a.date.localeCompare(b.date)),
    modelUsage,
    totalSessions: sessions.length,
    totalMessages: sessions.reduce((sum, s) => sum + s.user_message_count + s.assistant_message_count, 0),
    longestSession: longest ? {
      sessionId: longest.session_id,
      duration: longest.duration_minutes,
      messageCount: longest.user_message_count + longest.assistant_message_count,
      timestamp: longest.start_time,
    } : { sessionId: '', duration: 0, messageCount: 0, timestamp: '' },
    firstSessionDate: sessions[sessions.length - 1]?.start_time ?? '',
    hourCounts,
    totalSpeculationTimeSavedMs: 0,
  }
}

function computeDailyActivityFromSessions(sessions: SessionMeta[]): DailyActivity[] {
  const byDate = new Map<string, { messages: number; sessions: number; tools: number }>()
  for (const s of sessions) {
    const date = s.start_time.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const existing = byDate.get(date) ?? { messages: 0, sessions: 0, tools: 0 }
    existing.messages += s.user_message_count + s.assistant_message_count
    existing.sessions += 1
    existing.tools += Object.values(s.tool_counts ?? {}).reduce((a, b) => a + b, 0)
    byDate.set(date, existing)
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, messageCount: v.messages, sessionCount: v.sessions, toolCallCount: v.tools }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const sessions = await getSessions()
  const byPath = new Map<string, SessionMeta[]>()
  for (const s of sessions) {
    const key = s.project_path || 'Unknown'
    byPath.set(key, [...(byPath.get(key) ?? []), s])
  }

  return [...byPath.entries()].map(([projectPath, list]) => {
    const toolCounts: Record<string, number> = {}
    const branches = new Set<string>()
    const models = new Set<string>()
    const sources = new Set<string>()
    for (const s of list) {
      for (const [tool, count] of Object.entries(s.tool_counts)) toolCounts[tool] = (toolCounts[tool] ?? 0) + count
      if (s.git_branch) branches.add(s.git_branch)
      if (s.model) models.add(s.model)
      if (s.source) sources.add(s.source)
    }
    const sortedDates = list.map(s => s.start_time).sort()
    const estimatedCost = list.reduce((sum, s) => sum + estimateCostFromUsage(s.model ?? 'unknown', {
      input_tokens: s.input_tokens,
      output_tokens: s.output_tokens,
      cache_creation_input_tokens: s.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: s.cache_read_input_tokens ?? 0,
    }), 0)
    return {
      slug: pathToSlug(projectPath),
      project_path: projectPath,
      display_name: projectDisplayName(projectPath),
      session_count: list.length,
      total_messages: list.reduce((sum, s) => sum + s.user_message_count + s.assistant_message_count, 0),
      total_duration_minutes: list.reduce((sum, s) => sum + s.duration_minutes, 0),
      total_lines_added: 0,
      total_lines_removed: 0,
      total_files_modified: 0,
      git_commits: 0,
      git_pushes: 0,
      estimated_cost: estimatedCost,
      input_tokens: list.reduce((sum, s) => sum + s.input_tokens, 0),
      output_tokens: list.reduce((sum, s) => sum + s.output_tokens, 0),
      languages: {},
      tool_counts: toolCounts,
      last_active: sortedDates[sortedDates.length - 1] ?? '',
      first_active: sortedDates[0] ?? '',
      uses_mcp: list.some(s => s.uses_mcp),
      uses_task_agent: list.some(s => s.uses_task_agent),
      branches: [...branches],
      models: [...models],
      sources: [...sources],
    }
  }).sort((a, b) => b.last_active.localeCompare(a.last_active))
}

export async function readToolsAnalytics(): Promise<ToolsAnalytics> {
  const sessions = await getSessions()
  const totalSessions = sessions.length
  const toolTotals = new Map<string, number>()
  const toolSessions = new Map<string, Set<string>>()
  const mcpServerCalls = new Map<string, Map<string, number>>()
  const mcpServerSessions = new Map<string, Set<string>>()
  const versions = new Map<string, { sessions: Set<string>; dates: string[] }>()
  const branches = new Map<string, number>()
  const errorCategories: Record<string, number> = {}

  for (const s of sessions) {
    if (s.cli_version) {
      const v = versions.get(s.cli_version) ?? { sessions: new Set(), dates: [] }
      v.sessions.add(s.session_id)
      v.dates.push(s.start_time)
      versions.set(s.cli_version, v)
    }
    if (s.git_branch) branches.set(s.git_branch, (branches.get(s.git_branch) ?? 0) + 1)
    for (const [tool, count] of Object.entries(s.tool_counts)) {
      toolTotals.set(tool, (toolTotals.get(tool) ?? 0) + count)
      const set = toolSessions.get(tool) ?? new Set<string>()
      set.add(s.session_id)
      toolSessions.set(tool, set)
      if (isMcpTool(tool)) {
        const parsed = parseMcpTool(tool)
        if (parsed) {
          const toolMap = mcpServerCalls.get(parsed.server) ?? new Map<string, number>()
          toolMap.set(parsed.tool, (toolMap.get(parsed.tool) ?? 0) + count)
          mcpServerCalls.set(parsed.server, toolMap)
          const sessionsForServer = mcpServerSessions.get(parsed.server) ?? new Set<string>()
          sessionsForServer.add(s.session_id)
          mcpServerSessions.set(parsed.server, sessionsForServer)
        }
      }
    }
    for (const [category, count] of Object.entries(s.tool_error_categories)) {
      errorCategories[category] = (errorCategories[category] ?? 0) + count
    }
  }

  const tools = [...toolTotals.entries()].map(([name, total_calls]) => ({
    name,
    category: categorizeTool(name),
    total_calls,
    session_count: toolSessions.get(name)?.size ?? 0,
    error_count: 0,
  })).sort((a, b) => b.total_calls - a.total_calls)

  const featureSessions = {
    agents: sessions.filter(s => s.uses_task_agent).length,
    mcp: sessions.filter(s => s.uses_mcp).length,
    web_search: sessions.filter(s => s.uses_web_search).length,
    image_generation: sessions.filter(s => Object.keys(s.tool_counts).some(t => t.includes('image_generation'))).length,
    patching: sessions.filter(s => Object.keys(s.tool_counts).some(t => t.includes('apply_patch'))).length,
    shell: sessions.filter(s => Object.keys(s.tool_counts).some(t => t.includes('exec_command'))).length,
    extended_thinking: sessions.filter(s => s.reasoning_output_tokens || s.hasOwnProperty('reasoning_output_tokens')).length,
  }

  const feature_adoption: ToolsAnalytics['feature_adoption'] = {}
  for (const [key, count] of Object.entries(featureSessions)) {
    feature_adoption[key] = { sessions: count, pct: totalSessions ? count / totalSessions : 0 }
  }

  const versionRecords: VersionRecord[] = [...versions.entries()].map(([version, data]) => {
    const sorted = data.dates.sort()
    return {
      version,
      session_count: data.sessions.size,
      first_seen: sorted[0] ?? '',
      last_seen: sorted[sorted.length - 1] ?? '',
    }
  }).sort((a, b) => b.last_seen.localeCompare(a.last_seen))

  return {
    tools,
    mcp_servers: [...mcpServerCalls.entries()].map(([server_name, toolMap]) => {
      const serverTools = [...toolMap.entries()].map(([name, calls]) => ({ name, calls })).sort((a, b) => b.calls - a.calls)
      return {
        server_name,
        tools: serverTools,
        total_calls: serverTools.reduce((sum, t) => sum + t.calls, 0),
        session_count: mcpServerSessions.get(server_name)?.size ?? 0,
      }
    }).sort((a, b) => b.total_calls - a.total_calls),
    feature_adoption,
    versions: versionRecords,
    branches: [...branches.entries()].map(([branch, turns]) => ({ branch, turns })).sort((a, b) => b.turns - a.turns),
    error_categories: errorCategories,
    total_tool_calls: tools.reduce((sum, t) => sum + t.total_calls, 0),
    total_errors: Object.values(errorCategories).reduce((sum, count) => sum + count, 0),
  }
}

export async function readHistory(limit = 200): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(codexPath('history.jsonl'), 'utf-8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-limit).map(line => {
      const parsed = safeJsonParse<HistoryEntry>(line) ?? {}
      return {
        ...parsed,
        display: parsed.display ?? parsed.text ?? '',
        timestamp: parsed.timestamp ?? parsed.ts,
        sessionId: parsed.sessionId ?? parsed.session_id,
      }
    })
  } catch {
    return []
  }
}

export async function getCodexStorageBytes(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', CODEX_DIR], {
      timeout: 8_000,
      maxBuffer: 1024 * 1024,
    })
    const kb = Number(stdout.trim().split(/\s+/)[0])
    if (Number.isFinite(kb)) return kb * 1024
  } catch {
    // Fall through to the portable walker below.
  }

  async function dirSize(dirPath: string): Promise<number> {
    let entries: Array<import('fs').Dirent> = []
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return 0
    }
    const sizes = await Promise.all(entries.map(async entry => {
      const full = path.join(dirPath, entry.name)
      if (entry.isDirectory()) return dirSize(full)
      try {
        return (await fs.stat(full)).size
      } catch {
        return 0
      }
    }))
    return sizes.reduce((sum, size) => sum + size, 0)
  }
  return dirSize(CODEX_DIR)
}

export async function readInventory(limit = MAX_INVENTORY_ITEMS): Promise<CodexInventorySummary> {
  const items: CodexInventoryItem[] = []
  const categories = new Map<string, { bytes: number; files: number }>()
  const topLevel = new Map<string, { bytes: number; files: number; directories: number }>()
  let totalBytes = 0
  let totalFiles = 0
  let totalDirectories = 0

  async function walk(dir: string) {
    let entries: Array<import('fs').Dirent> = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const relativePath = path.relative(CODEX_DIR, full)
      const topName = relativePath.split(path.sep)[0] || entry.name
      try {
        const stat = await fs.stat(full)
        const isDir = entry.isDirectory()
        const category = fileCategory(relativePath, isDir)
        if (isDir) totalDirectories++
        else {
          totalFiles++
          totalBytes += stat.size
        }
        const cat = categories.get(category) ?? { bytes: 0, files: 0 }
        cat.bytes += isDir ? 0 : stat.size
        cat.files += isDir ? 0 : 1
        categories.set(category, cat)
        const top = topLevel.get(topName) ?? { bytes: 0, files: 0, directories: 0 }
        top.bytes += isDir ? 0 : stat.size
        top.files += isDir ? 0 : 1
        top.directories += isDir ? 1 : 0
        topLevel.set(topName, top)
        if (items.length < limit) {
          items.push({
            path: full,
            relativePath,
            kind: isDir ? 'directory' : 'file',
            category,
            sizeBytes: isDir ? 0 : stat.size,
            mtime: stat.mtime.toISOString(),
            redacted: isSensitiveRelativePath(relativePath),
            previewable: !isDir && !isSensitiveRelativePath(relativePath) && isPreviewable(relativePath),
          })
        }
        if (isDir) await walk(full)
      } catch {
        // skip racing files
      }
    }
  }

  await walk(CODEX_DIR)
  return {
    root: CODEX_DIR,
    totalBytes,
    totalFiles,
    totalDirectories,
    categories: [...categories.entries()].map(([category, data]) => ({ category, ...data })).sort((a, b) => b.bytes - a.bytes),
    topLevel: [...topLevel.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.bytes - a.bytes),
    items: items.sort((a, b) => b.mtime.localeCompare(a.mtime)),
  }
}

function parseTomlValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map(v => parseTomlValue(v)).filter(v => v !== '')
  }
  return trimmed
}

function readTomlSections(raw: string): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = { root: {} }
  let current = 'root'
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const section = line.match(/^\[(.+)]$/)
    if (section) {
      current = section[1]
      sections[current] = sections[current] ?? {}
      continue
    }
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    sections[current][key] = parseTomlValue(value)
  }
  return sections
}

export async function readConfigSummary(): Promise<CodexConfigSummary> {
  const raw = await fs.readFile(codexPath('config.toml'), 'utf-8').catch(() => '')
  const sections = readTomlSections(raw)
  const modelsCache = await readJsonFile<{ models?: Array<Record<string, unknown>> }>(codexPath('models_cache.json'), { models: [] })
  const globalState = await readJsonFile<Record<string, unknown>>(codexPath('.codex-global-state.json'), {})
  const versionState = await readJsonFile<Record<string, unknown>>(codexPath('version.json'), {})

  const trustedProjects = Object.entries(sections)
    .filter(([name]) => name.startsWith('projects.'))
    .map(([name, data]) => ({
      path: name.replace(/^projects\./, '').replace(/^"|"$/g, ''),
      trust_level: String(data.trust_level ?? ''),
    }))

  const mcpServers = Object.entries(sections)
    .filter(([name]) => name.startsWith('mcp_servers.'))
    .map(([name, data]) => ({
      name: name.replace(/^mcp_servers\./, '').replace(/^"|"$/g, ''),
      transport: data.url ? 'remote' : 'stdio',
      command: data.command ? String(data.command) : undefined,
      url: data.url ? String(data.url) : undefined,
    }))

  const plugins = Object.entries(sections)
    .filter(([name]) => name.startsWith('plugins.'))
    .map(([name, data]) => ({
      id: name.replace(/^plugins\./, '').replace(/^"|"$/g, ''),
      enabled: Boolean(data.enabled),
    }))

  const marketplaces = Object.entries(sections)
    .filter(([name]) => name.startsWith('marketplaces.'))
    .map(([name, data]) => ({
      id: name.replace(/^marketplaces\./, ''),
      source_type: data.source_type ? String(data.source_type) : undefined,
      last_updated: data.last_updated ? String(data.last_updated) : undefined,
    }))

  return {
    root: CODEX_DIR,
    config: sections.root ?? {},
    configPreview: stripSensitiveText(raw),
    trustedProjects,
    mcpServers,
    plugins,
    marketplaces,
    models: (modelsCache.models ?? []).map(model => ({
      slug: model.slug,
      display_name: model.display_name,
      description: model.description,
      context_window: model.context_window,
      max_context_window: model.max_context_window,
      default_reasoning_level: model.default_reasoning_level,
      supported_reasoning_levels: Array.isArray(model.supported_reasoning_levels)
        ? model.supported_reasoning_levels
        : [],
      supports_search_tool: model.supports_search_tool,
      supports_parallel_tool_calls: model.supports_parallel_tool_calls,
      visibility: model.visibility,
    })),
    globalStateKeys: Object.keys(globalState).sort(),
    versionState,
  }
}

export async function readLogSummary(limit = 200): Promise<CodexLogSummary> {
  const db = codexPath('logs_2.sqlite')
  const [levelRows, targetRows, recentRows] = await Promise.all([
    sqliteRows<{ level: string; count: number }>(db, 'select level, count(*) as count from logs group by level order by count desc'),
    sqliteRows<{ target: string; count: number }>(db, 'select target, count(*) as count from logs group by target order by count desc limit 30'),
    sqliteRows<Record<string, unknown>>(db, `select id, ts, level, target, module_path, file, line, thread_id, feedback_log_body from logs order by ts desc, ts_nanos desc, id desc limit ${Math.min(limit, 1000)}`),
  ])
  return {
    total: levelRows.reduce((sum, r) => sum + Number(r.count ?? 0), 0),
    levels: levelRows.map(r => ({ level: String(r.level), count: Number(r.count) })),
    targets: targetRows.map(r => ({ target: String(r.target), count: Number(r.count) })),
    recent: recentRows.map(r => ({
      id: Number(r.id),
      ts: Number(r.ts),
      level: String(r.level),
      target: String(r.target),
      module_path: r.module_path ? String(r.module_path) : undefined,
      file: r.file ? String(r.file) : undefined,
      line: r.line ? Number(r.line) : undefined,
      thread_id: r.thread_id ? String(r.thread_id) : undefined,
      message: r.feedback_log_body ? truncate(stripSensitiveText(String(r.feedback_log_body)), 500) : undefined,
    })),
  }
}

export async function readAssets(): Promise<CodexAsset[]> {
  const assets: CodexAsset[] = []
  const addFile = async (filePath: string, kind: CodexAsset['kind'], title?: string, metadata?: Record<string, unknown>) => {
    try {
      const stat = await fs.stat(filePath)
      const relativePath = path.relative(CODEX_DIR, filePath)
      assets.push({
        path: filePath,
        relativePath,
        kind,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        href: kind === 'image' || relativePath.endsWith('.webp') || relativePath.endsWith('.png')
          ? `/api/assets/file?relative=${encodeURIComponent(relativePath)}`
          : undefined,
        title: title ?? path.basename(filePath),
        metadata,
      })
    } catch {
      // skip
    }
  }

  for (const file of await listFilesRecursive(codexPath('generated_images'), f => /\.(png|jpe?g|webp)$/i.test(f))) {
    await addFile(file, 'image', path.basename(path.dirname(file)))
  }
  for (const file of await listFilesRecursive(codexPath('pets'), f => /\.(json|png|webp)$/i.test(f))) {
    const metadata = file.endsWith('.json') ? await readJsonFile<Record<string, unknown>>(file, {}) : undefined
    await addFile(file, file.endsWith('.json') ? 'pet' : 'image', metadata?.displayName ? String(metadata.displayName) : path.basename(path.dirname(file)), metadata)
  }
  for (const file of await listFilesRecursive(codexPath('shell_snapshots'), f => f.endsWith('.sh'))) {
    await addFile(file, 'snapshot')
  }
  for (const file of await listFilesRecursive(codexPath('ambient-suggestions'), f => f.endsWith('.json'))) {
    await addFile(file, 'suggestion')
  }
  return assets.sort((a, b) => b.mtime.localeCompare(a.mtime))
}

export async function readAssetFile(relativePath: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) return null
  const full = path.resolve(CODEX_DIR, relativePath)
  const allowedRoots = ['generated_images', 'pets'].map(root => path.resolve(CODEX_DIR, root))
  if (!allowedRoots.some(root => full.startsWith(root + path.sep))) return null
  const ext = path.extname(full).toLowerCase()
  const contentType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ''
  if (!contentType) return null
  try {
    return { data: await fs.readFile(full), contentType }
  } catch {
    return null
  }
}

export async function readAgentSummary(): Promise<CodexAgentSummary> {
  const state = codexPath('state_5.sqlite')
  const automation = codexPath('sqlite', 'codex-dev.db')
  const [spawn_edges, dynamic_tools, jobs, agent_jobs, goals, automations, automation_runs] = await Promise.all([
    sqliteRows<Record<string, unknown>>(state, 'select parent_thread_id, child_thread_id, status from thread_spawn_edges order by parent_thread_id'),
    sqliteRows<Record<string, unknown>>(state, 'select thread_id, name, namespace, defer_loading from thread_dynamic_tools order by thread_id, position'),
    sqliteRows<Record<string, unknown>>(state, 'select kind, job_key, status, started_at, finished_at, last_error from jobs order by started_at desc limit 200'),
    sqliteRows<Record<string, unknown>>(state, 'select id, name, status, created_at, updated_at, started_at, completed_at, last_error from agent_jobs order by updated_at desc limit 200'),
    sqliteRows<Record<string, unknown>>(state, 'select thread_id, goal_id, objective, status, token_budget, tokens_used, time_used_seconds from thread_goals order by updated_at_ms desc limit 200'),
    sqliteRows<Record<string, unknown>>(automation, 'select id, name, status, next_run_at, last_run_at, created_at, updated_at, model, reasoning_effort from automations order by updated_at desc limit 200'),
    sqliteRows<Record<string, unknown>>(automation, 'select thread_id, automation_id, status, thread_title, source_cwd, inbox_title, created_at, updated_at from automation_runs order by updated_at desc limit 200'),
  ])
  return {
    spawn_edges: spawn_edges.map(r => ({
      parent_thread_id: String(r.parent_thread_id ?? ''),
      child_thread_id: String(r.child_thread_id ?? ''),
      status: String(r.status ?? ''),
    })),
    dynamic_tools: dynamic_tools.map(r => ({
      thread_id: String(r.thread_id ?? ''),
      name: String(r.name ?? ''),
      namespace: r.namespace ? String(r.namespace) : undefined,
      defer_loading: Boolean(r.defer_loading),
    })),
    jobs,
    agent_jobs,
    goals,
    automations,
    automation_runs,
  }
}

function editableKind(relativePath: string): EditableFile['kind'] | null {
  if (relativePath === 'AGENTS.md') return 'agent'
  if (relativePath.startsWith(`rules${path.sep}`) && relativePath.endsWith('.rules')) return 'rule'
  if (relativePath.startsWith(`memories${path.sep}`) && relativePath.endsWith('.md')) return 'memory'
  return null
}

function resolveEditablePath(relativePath: string): { full: string; kind: EditableFile['kind'] } | null {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) return null
  const normalized = path.normalize(relativePath)
  const kind = editableKind(normalized)
  if (!kind) return null
  const full = path.resolve(CODEX_DIR, normalized)
  if (!full.startsWith(CODEX_DIR + path.sep)) return null
  return { full, kind }
}

export async function readEditableFiles(): Promise<EditableFile[]> {
  const candidates = [
    codexPath('AGENTS.md'),
    ...(await listFilesRecursive(codexPath('rules'), f => f.endsWith('.rules'))),
    ...(await listFilesRecursive(codexPath('memories'), f => f.endsWith('.md'))),
  ]
  const out: EditableFile[] = []
  for (const filePath of candidates) {
    try {
      const relativePath = path.relative(CODEX_DIR, filePath)
      const resolved = resolveEditablePath(relativePath)
      if (!resolved) continue
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_PREVIEW_BYTES) continue
      out.push({
        path: filePath,
        relativePath,
        kind: resolved.kind,
        content: await fs.readFile(filePath, 'utf-8'),
        mtime: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      })
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export async function writeEditableFile(relativePath: string, content: string): Promise<boolean> {
  const resolved = resolveEditablePath(relativePath)
  if (!resolved || content.length > 500_000) return false
  await fs.mkdir(path.dirname(resolved.full), { recursive: true })
  if (await fileExists(resolved.full)) {
    await fs.copyFile(resolved.full, `${resolved.full}.bak`)
  }
  await fs.writeFile(resolved.full, content, 'utf-8')
  return true
}

function readFrontmatterValue(raw: string, key: string): string | undefined {
  const frontmatter = raw.startsWith('---')
    ? raw.slice(3, raw.indexOf('\n---', 3) === -1 ? undefined : raw.indexOf('\n---', 3))
    : raw
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!match?.[1]) return undefined
  const value = match[1].trim()
  if (value === '>' || value === '|') return undefined
  return value.replace(/^['"]|['"]$/g, '')
}

function pluginNameFromSkillPath(file: string): string | undefined {
  const relative = path.relative(codexPath('plugins', 'cache'), file)
  if (relative.startsWith('..')) return undefined
  const parts = relative.split(path.sep)
  if (parts.length < 2) return undefined
  return `${parts[0]}/${parts[1]}`
}

export async function readSkills(): Promise<CodexSkillSummary[]> {
  const roots: Array<{ root: string; source: CodexSkillSummary['source']; label: string }> = [
    { root: codexPath('skills'), source: 'user', label: '~/.codex/skills' },
    { root: codexPath('plugins', 'cache'), source: 'plugin', label: '~/.codex/plugins/cache' },
    { root: AGENTS_SKILLS_DIR, source: 'external', label: '~/.agents/skills' },
  ]

  const filesByPath = new Map<string, { source: CodexSkillSummary['source']; label: string; root: string }>()
  for (const rootInfo of roots) {
    for (const file of await listFilesRecursive(rootInfo.root, f => path.basename(f) === 'SKILL.md')) {
      const source = file.startsWith(codexPath('skills', '.system') + path.sep) ? 'system' : rootInfo.source
      const label = source === 'system' ? '~/.codex/skills/.system' : rootInfo.label
      filesByPath.set(file, { ...rootInfo, source, label })
    }
  }

  const skills = await Promise.all([...filesByPath.entries()].map(async ([file, sourceInfo]) => {
    const raw = await fs.readFile(file, 'utf-8').catch(() => '')
    const name = readFrontmatterValue(raw, 'name') ?? path.basename(path.dirname(file))
    const desc = readFrontmatterValue(raw, 'description') ?? raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
    const version = readFrontmatterValue(raw, 'version')
    const userInvocableRaw = readFrontmatterValue(raw, 'user-invocable')
    const relativePath = path.relative(os.homedir(), file)
    const plugin = sourceInfo.source === 'plugin' ? pluginNameFromSkillPath(file) : undefined
    return {
      name,
      description: desc,
      path: file,
      relativePath: relativePath.startsWith('..') ? file : `~/${relativePath}`,
      source: sourceInfo.source,
      sourceLabel: plugin ?? sourceInfo.label,
      plugin,
      version,
      userInvocable: userInvocableRaw ? userInvocableRaw === 'true' : undefined,
    }
  }))

  const sourceOrder: Record<CodexSkillSummary['source'], number> = {
    user: 0,
    system: 1,
    plugin: 2,
    external: 3,
  }
  return skills.sort((a, b) =>
    sourceOrder[a.source] - sourceOrder[b.source] ||
    a.name.localeCompare(b.name)
  )
}

export async function readInstalledPlugins() {
  const files = await listFilesRecursive(codexPath('plugins', 'cache'), f => path.basename(f) === 'plugin.json')
  return Promise.all(files.map(async file => {
    const json = await readJsonFile<Record<string, unknown>>(file, {})
    return {
      id: String(json.id ?? json.name ?? path.basename(path.dirname(path.dirname(file)))),
      scope: path.relative(codexPath('plugins', 'cache'), file).split(path.sep)[0] ?? '',
      version: String(json.version ?? ''),
      installedAt: '',
      path: file,
    }
  }))
}

export async function readSettings(): Promise<Record<string, unknown>> {
  const summary = await readConfigSummary()
  return {
    root: summary.root,
    config: summary.config,
    trustedProjects: summary.trustedProjects.length,
    mcpServers: summary.mcpServers.length,
    plugins: summary.plugins.length,
    marketplaces: summary.marketplaces.length,
    models: summary.models.length,
  }
}
