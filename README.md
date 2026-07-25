# squint

**Lovable for your terminal.** squint is a frontend harness that sits on top of the coding agents you already have — Claude Code, Codex CLI, Gemini CLI, OpenCode — and turns them into a design-obsessed app builder that works on **any repo**, local-first.

Lovable proved the loop: prompt → generate → preview → auto-fix → iterate. But it's a closed SaaS. You can't point it at an existing codebase, choose your agent or model, or own the loop. squint is that missing layer, in your terminal.

```
┌──────────────────────────────────────────────┐
│  squint   claude · claude-sonnet-5 · my-app  │
│                                              │
│  ❯ make the pricing page feel premium        │
│  ⚙ Read · src/pages/Pricing.tsx              │
│  ⚙ Edit · src/pages/Pricing.tsx              │
│  Reworked the tier cards around a real       │
│  type scale and tightened the palette…       │
│  · done · 41s · $0.18                        │
│                                              │
│  ❯ ▏                                         │
│  enter send · /help commands · ctrl+c quit   │
└──────────────────────────────────────────────┘
```

## What it does

- **Drives any agent** — pluggable engines invoke Claude Code, Codex, Gemini CLI, or OpenCode headlessly and normalize their output into one stream.
- **Holds a design standard** — every ask is wrapped in an opinionated design brief (design tokens, real typographic hierarchy, anti-generic-AI-look rules, a11y, responsive). Override it per project with `.squint/brief.md`.
- **Works on your repo** — no cloud project, no lock-in. `cd` anywhere and run it.
- **One config for engines and models** — `squint config set engine claude`, `squint config set models.claude claude-sonnet-5`. API keys stay wherever your agent CLIs already read them.

## Install

```sh
git clone https://github.com/aayambansal/squint.git
cd squint
npm install && npm run build && npm link
```

You need at least one engine installed (`squint doctor` will tell you):

| Engine | Install |
| --- | --- |
| Claude Code | `npm i -g @anthropic-ai/claude-code` |
| Codex CLI | `npm i -g @openai/codex` |
| Gemini CLI | `npm i -g @google/gemini-cli` |
| OpenCode | `npm i -g opencode-ai` |

## Use

```sh
squint                          # launch the TUI in the current repo
squint run "add a dark mode toggle to the navbar"
squint run -e codex -m gpt-5 "tighten the hero spacing"
squint engines                  # what's installed
squint doctor                   # environment check
squint config set engine claude
squint config set models.claude claude-sonnet-5
squint config set --project engine codex   # per-repo override
```

Inside the TUI: `/engine <id>`, `/model <name>`, `/clear`, `/quit`.

## Roadmap

- Dev-server manager: squint runs your dev server, catches build/runtime errors, and feeds them back to the agent automatically
- Visual loop: screenshot the running app each turn and let the agent critique its own work
- Quality gates: typecheck, lint, console errors, a11y, multi-viewport checks between turns
- `squint init`: opinionated Vite + React + TS + Tailwind scaffold
- More engines: Aider, Cursor CLI

See `docs/design/` for architecture notes.

## License

MIT © Aayam Bansal
