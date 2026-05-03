# Codex Lens

Codex Lens is a local analytics dashboard for OpenAI Codex usage. It reads your local `~/.codex/` folder and turns sessions, projects, tools, config, skills, logs, assets, and activity history into a browsable dashboard.

No cloud backend. No telemetry. No API key. Your data stays on your machine.

```bash
npx codex-lens-dashboard
```

By default Codex Lens reads `~/.codex/`. To inspect another Codex profile or folder:

```bash
CODEX_CONFIG_DIR=~/.codex-work npx codex-lens-dashboard
```

## What Codex Lens Does

Codex creates useful local data while you work: JSONL session logs, project metadata, tool calls, model selections, skills, plugins, config files, generated assets, SQLite logs, and editable memories or rules. Most of that information is hard to inspect manually.

Codex Lens gives you a local dashboard for answering questions like:

- How many Codex sessions did I run recently?
- Which projects are most active?
- Which tools are being used most often?
- What models and token counts appear in my local sessions?
- Which skills, plugins, and MCP servers are installed?
- What files exist under `~/.codex/`, and which ones may contain sensitive data?
- What trusted projects are configured?
- What generated images, pets, snapshots, logs, and history entries exist locally?

## Quick Start

Run directly with npx:

```bash
npx codex-lens-dashboard
```

The CLI starts a local Next.js server and opens the dashboard in your browser. On first run, it mirrors the app into `~/.codex-lens/` and installs runtime dependencies there.

Useful environment variables:

```bash
CODEX_CONFIG_DIR=~/.codex-work npx codex-lens-dashboard
CODEX_LENS_CACHE_DIR=/tmp/codex-lens-runtime npx codex-lens-dashboard
```

- `CODEX_CONFIG_DIR`: folder to analyze. Defaults to `~/.codex`.
- `CODEX_LENS_CACHE_DIR`: runtime app cache folder. Defaults to `~/.codex-lens`.

## Dashboard Sections

### Overview

The overview page summarizes recent Codex activity:

- Sessions, messages, token usage, and estimated cost.
- Time range controls for 7 days, 30 days, 90 days, and custom ranges.
- Usage over time charts.
- Token breakdowns.
- Model distribution.
- Project activity.
- Peak usage hours.
- Recent sessions.

The main metric cards recalculate when the selected date range changes.

### Sessions

The sessions page reads local Codex rollout JSONL files and shows:

- Session list with timestamps, projects, models, branches, and message counts.
- Session detail pages.
- Conversation replay.
- User turns, assistant turns, reasoning blocks, tool calls, and tool results.
- Token accumulation over a session.
- Compaction markers when available.

This is useful for debugging long-running Codex work and understanding how a task evolved.

### Projects

Projects are grouped from session working directories and related metadata.

The projects view shows:

- Per-project activity.
- Recent sessions per project.
- Branch and model usage.
- Tool usage by project.
- Project detail pages with related sessions.

### Tools

The tools dashboard tracks tool usage across local sessions and Codex metadata:

- Shell and command execution.
- Patch/application tools.
- Web/search-style tools when present in logs.
- MCP tools.
- App/plugin tools.
- Subagent and planning-related tool usage.
- Feature adoption and tool ranking summaries.

This helps reveal what parts of Codex you actually use most.

### Activity

The activity page focuses on time-based behavior:

- Daily activity heatmap.
- Active-day streaks.
- Peak hour patterns.
- Day-of-week usage.
- Recent activity totals.

### Costs

Codex Lens reads token counters from local session data and aggregates:

- Tokens over time.
- Model token tables.
- Cache efficiency.
- Project-level token/cost breakdowns.

Important: Codex stores token counters, not final billing totals. The default pricing table intentionally avoids presenting stale OpenAI billing estimates as fact. If you want dollar charts locally, update `lib/pricing.ts` with your own rates.

### Config

The config page summarizes local Codex configuration without exposing secrets:

- Redacted `config.toml`.
- Trusted projects.
- MCP servers.
- Plugins and plugin marketplaces.
- Model cache metadata.
- Global-state keys.
- Skills snapshot.

Known secret-bearing values are redacted before display.

### Skills

The skills page shows Codex skills discovered from multiple local locations:

- User skills from `~/.codex/skills`.
- Internal/system skills from `~/.codex/skills/.system`.
- Plugin-provided skills from `~/.codex/plugins/cache/**/SKILL.md`.
- External agent skills from `~/.agents/skills`.

Each skill card includes its source, path, description, plugin source when available, and whether the skill appears user-invocable when that metadata exists.

### Inventory

The inventory page builds a local file-tree view of Codex data:

- Total files, directories, and storage size.
- File type breakdown.
- Visible `~/.codex/` folders and files.
- Metadata-only display for redacted or sensitive files.
- Large-file and asset visibility.

This is intended to show what exists locally without dumping secret file contents into the UI.

### Logs

The logs page reads local SQLite log data when present and summarizes:

- Log levels.
- Log targets.
- Recent redacted log messages.
- Counts and timestamps.

### Assets

The assets page surfaces local generated or cached artifacts:

- Generated images.
- Pets.
- Shell snapshots.
- Ambient suggestions.
- Other visible asset-like files under Codex storage.

### Agents

The agents page focuses on Codex agent/subagent metadata when available:

- Spawn edges.
- Dynamic tools.
- Jobs and goals.
- Automations and automation runs.

### Editable

The editable section provides guarded editing for selected local Codex files:

- `AGENTS.md`
- `rules/*.rules`
- Markdown files under `memories/`

The editable surface is intentionally narrow so the dashboard does not become an unsafe general-purpose file editor for the whole Codex folder.

### History, Memory, Plans, Todos, Settings, Export

Additional pages expose supporting Codex data:

- History: local prompt/history entries.
- Memory: memory-related files and summaries.
- Plans: plan metadata when present.
- Todos: todo-like session artifacts when present.
- Settings: dashboard settings and local app controls.
- Export/import: portable JSON export and preview-only import diff.

## Data Sources

Codex Lens reads local data from these paths when present:

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
- `~/.codex/rules/`
- `~/.codex/AGENTS.md`
- `~/.codex/memories/`
- `~/.codex/skills/`
- `~/.codex/plugins/`
- `~/.codex/cache/`
- related vendor, temp, and plugin cache directories when visible

## Privacy And Safety

Codex Lens is designed as a local-first inspection tool.

- It runs locally.
- It reads from your local Codex folder.
- It does not require an OpenAI API key.
- It does not send telemetry.
- It does not upload your sessions to a hosted service.
- It redacts known secret-bearing files and fields in dashboard surfaces.

Examples of sensitive material treated carefully include `auth.json`, installation IDs, token-like keys, account identifiers, and device-key state.

Still, your `~/.codex/` folder may contain prompts, code snippets, command output, project paths, and other local context. Treat the dashboard as private developer tooling.

## Real Data Versus Derived Metrics

Codex Lens is not meant to invent activity. It reads real local files and derives summaries from them.

Real local data includes:

- Session JSONL entries.
- Timestamps.
- Message counts.
- Tool call records.
- Model names recorded in sessions.
- Token counters when present.
- Local config files.
- SQLite log records.
- Skill and plugin files.
- Generated assets and local inventory.

Derived metrics include:

- Aggregated session counts.
- Daily activity summaries.
- Project grouping by working directory.
- Tool category grouping.
- Time-range comparisons.
- Estimated cost.

Cost is the most important caveat: Codex stores token counters, not final billing invoices. Cost charts are estimates only when a local pricing table is configured.

## Development

Clone and run locally:

```bash
git clone https://github.com/shivaylamba/codex-lens.git
cd codex-lens
npm install
npm run dev
```

Open the local URL printed by Next.js.

Quality checks:

```bash
npm run lint
npm run build
```

Package dry run:

```bash
npm pack --dry-run
```

## Publishing

The npm package name is:

```bash
codex-lens-dashboard
```

After npm login:

```bash
npm publish --access public
```

Users can then run:

```bash
npx codex-lens-dashboard
```

## Attribution

Codex Lens is built on the basis of [CC Lens](https://github.com/Arindam200/cc-lens), a local analytics dashboard for Claude Code created by [Arindam](https://github.com/Arindam200).

This project adapts that local-dashboard idea for OpenAI Codex and the `~/.codex/` data model, with Codex-specific inventory, skills, plugins, config, sessions, tools, assets, and UI treatment.

## License

MIT
