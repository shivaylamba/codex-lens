# Codex Lens

Local analytics and inventory for Codex. No cloud backend, no telemetry, no API key: the dashboard reads your local `~/.codex/` data.

```bash
npx codex-lens
```

By default Codex Lens reads `~/.codex/`. To point at another profile:

```bash
CODEX_CONFIG_DIR=~/.codex-work npx codex-lens
```

## What It Shows

- Overview: sessions, messages, tokens, tool calls, active days, storage, model mix, peak hours, and recent sessions.
- Sessions: rollout JSONL sessions with replay, reasoning, tool calls, tool results, compaction markers, and token accumulation.
- Projects: activity grouped by Codex thread `cwd`, with branches, models, tools, and per-project sessions.
- Tools: shell, patch, web search, image generation, MCP, subagent, planning, and app/plugin tool usage.
- Activity: calendar heatmap, streaks, peak hours, and day-of-week patterns.
- Inventory: complete visible `~/.codex/` file tree with storage breakdown and redaction flags.
- Config: redacted `config.toml`, trusted projects, MCP servers, plugins, marketplaces, model cache, and global-state keys.
- Logs: SQLite log level/target summaries and redacted recent log messages.
- Assets: generated images, pets, shell snapshots, and ambient suggestions.
- Agents: spawn edges, dynamic tools, jobs, goals, automations, and automation runs.
- Editable: guarded edits for `AGENTS.md`, `rules/*.rules`, and Markdown files under `memories/`.
- Export/import: portable JSON export and preview-only import diff.

## Data Sources

Codex Lens reads these local sources when present:

- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/state_5.sqlite`
- `~/.codex/logs_2.sqlite`
- `~/.codex/sqlite/codex-dev.db`
- `~/.codex/history.jsonl`
- `~/.codex/session_index.jsonl`
- `~/.codex/config.toml`
- `~/.codex/models_cache.json`
- `~/.codex/.codex-global-state.json`
- `~/.codex/generated_images/`
- `~/.codex/pets/`
- `~/.codex/shell_snapshots/`
- `~/.codex/ambient-suggestions/`
- `~/.codex/rules/`, `~/.codex/AGENTS.md`, and `~/.codex/memories/`
- `~/.codex/skills/`, `~/.codex/plugins/`, `~/.codex/cache/`, vendor imports, and temp directories as inventory metadata

Known secret-bearing files such as `auth.json`, installation IDs, token-like fields, and device-key state are treated as redacted metadata in dashboard surfaces.

## Development

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js.

```bash
npm run lint
npm run build
```

## Cost Estimates

Codex stores token counters, not final billing totals. `lib/pricing.ts` defaults OpenAI/Codex model prices to zero so the app does not present stale or incorrect billing estimates. Fill in rates locally if you want cost charts to show dollar estimates.
