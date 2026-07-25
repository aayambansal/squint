# squint — architecture

**One-liner:** Lovable for your terminal. A frontend harness that sits on top of coding agents you already have (Claude Code, Codex, Gemini CLI, OpenCode) and turns them into a design-obsessed app builder that works on any repo, local-first.

## Why

Lovable proved the loop: prompt → generate → live preview → error auto-fix → iterate. But it's a closed SaaS: you can't point it at an existing repo, pick your agent, or own the loop. Coding-agent CLIs (Claude Code, Codex) are general-purpose: they don't manage your dev server, look at the rendered UI, or hold a design standard. squint is the missing layer between them.

## Core concepts

### 1. Engines (adapters)
Every coding agent CLI is an **engine**. An engine knows how to:
- detect itself (binary on PATH)
- build a headless invocation (`claude -p … --output-format stream-json`, `codex exec --json`, …)
- parse its output stream into **normalized AgentEvents**: `status | text | tool | result | error | raw`
- resume sessions where supported (Claude `--resume <id>`)

Engines are dumb translators. All product behavior lives in the harness, so a new engine is ~80 lines.

### 2. The harness loop (what makes it "frontend")
- **Prompt enrichment** — every ask is wrapped in a *design brief*: an opinionated frontend-craft system prompt (design tokens first, real typographic hierarchy, anti-generic-AI-look rules, a11y, responsive, no console errors). Overridable per-project via `.squint/brief.md`.
- **Dev server management** *(next iteration)* — squint starts/watches the project dev server, captures build/runtime errors, feeds them back to the engine automatically (Lovable's "try to fix" loop).
- **Visual loop** *(next iteration)* — screenshot the running app after each turn (headless Chrome/Playwright), optionally feed the image back for visual self-critique.
- **Quality gates** *(next iteration)* — tsc, eslint, console errors, axe a11y, multi-viewport checks, run between turns.

### 3. Surfaces
- **TUI** (`squint`) — Ink 6 chat interface: transcript, streaming output, engine/model in status bar, slash commands (`/engine`, `/model`, `/clear`).
- **CLI** — `squint run "<prompt>"` one-shot headless; `squint doctor`; `squint engines`; `squint config set|get|path`.

### 4. Config
- Global: `~/.config/squint/config.json` (XDG-aware)
- Project: `.squint/config.json` (merged over global)
- Keys: `engine`, `models.<engineId>`. API keys stay in the environment where the underlying CLIs already read them — squint never stores raw secrets in v0.

## Data flow

```
user ask ─→ compose(brief, ask) ─→ engine.buildArgs ─→ spawn CLI
                                                        │ stdout (ndjson/text)
   TUI/CLI render ←─ normalized AgentEvents ←─ engine.parseLine
```

## Error handling
- Missing binary → actionable error naming the install command (`doctor` shows all).
- Unparseable stream lines → `raw` events, never crashes the run.
- Non-zero exit without a `result` event → synthesized `error` event with stderr tail.

## Testing
Pure logic (arg building, stream parsing, config merge, prompt composition) is unit-tested with Vitest. Subprocess and TUI layers stay thin.

## Stack
Node ≥ 20, TypeScript strict, ESM. Ink 6 + React 19 (TUI), Commander (CLI), Zod (config), tsup (build), Vitest (tests). No heavyweight deps.

## Roadmap (each step = one PR)
1. **Scaffold** — engines (claude/codex/gemini/opencode), config, brief v0, run/doctor/engines/config, minimal TUI. ← this doc
2. Dev-server manager + build-error feedback loop
3. Screenshot/visual iteration loop (Chrome headless)
4. Research-informed brief v1 (Lovable/v0/Bolt prompt analysis) + per-project design profiles
5. TUI polish: themes, diff summaries, cost/session panel, keybindings
6. `squint init` (opinionated Vite+React+TS+Tailwind scaffold), quality gates, more engines (Aider, Cursor CLI)
