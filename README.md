# squint

[![npm](https://img.shields.io/npm/v/%40aayambansal%2Fsquint)](https://www.npmjs.com/package/@aayambansal/squint) [![ci](https://github.com/aayambansal/squint/actions/workflows/ci.yml/badge.svg)](https://github.com/aayambansal/squint/actions/workflows/ci.yml) [![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Lovable for your terminal.** squint is a frontend harness that sits on top of the coding agents you already have — Claude Code, Codex CLI, Gemini CLI, OpenCode, Amp, Cursor CLI, Copilot CLI, Aider — and turns them into a design-obsessed app builder that works on **any repo**, local-first.

Lovable proved the loop: prompt → generate → preview → auto-fix → iterate. But it's a closed SaaS. You can't point it at an existing codebase, choose your agent or model, or own the loop. squint is that missing layer, in your terminal.

```
┌──────────────────────────────────────────────────────────┐
│  ❯ make the pricing page feel premium                    │
│  ⚙ Read · src/pages/Pricing.tsx                          │
│  ⚙ Edit · src/pages/Pricing.tsx                          │
│  Reworked the tier cards around a real type scale and    │
│  tightened the palette to ink + one accent…              │
│  · done · 41s · $0.18                                    │
│  ✗ dev server: 1 error line(s)                           │
│    error TS2304: Cannot find name 'Tier'                 │
│  · auto-fix attempt 1/2                                  │
│  ⛑ fix dev server errors                                 │
│  · done · 12s · $0.05                                    │
│                                                          │
│  ❯ ▏                                                     │
│  claude · my-app · http://localhost:5173 · /help         │
└──────────────────────────────────────────────────────────┘
```

## The loop

1. **You describe.** Every ask is wrapped in squint's design brief — an opinionated standard built from studying Lovable's leaked prompts, v0's design rules, and the documented catalog of "AI slop" tells: commit to a direction before code, tokens are the system, banned generic patterns, real craft details. Override per project with `.squint/brief.md`.
2. **Your agent builds.** squint drives whichever engine you choose, headlessly, streaming its work into the transcript token by token.
3. **The dev server judges.** squint runs your dev server, watches for build errors after every turn, and routes fresh breakage straight back to the engine (`/fix`, or automatic with `autoFix`).
4. **The runtime is watched.** After every clean turn, squint loads the page headlessly (CDP over Chrome, ~2s) and catches what the dev server never prints — blank pages, uncaught exceptions, console errors, failed requests — and feeds those back too.
5. **The agent looks at its work.** `/review` screenshots the running app at mobile/tablet/desktop and re-prompts the engine to critique what it can *see* — then fix it.
6. **Gates keep it honest.** `/check` runs typecheck → lint → test → build and feeds failures back, with instructions not to weaken the checks.
7. **Everything is reversible.** Each ask is snapshotted via git plumbing; `/undo` reverts the whole turn — while your own uncommitted work survives.
8. **Point at things.** `squint tag` (wired automatically in new apps) adds an element picker to your dev server: **Alt+S**, click any element, and a self-locating reference (`src/App.tsx <h1 class="…"> "Ready."`) lands on your clipboard to paste into squint.
9. **Explore in parallel.** `squint variants gen 3 "landing page for …"` builds the same ask three ways — three git worktrees, three *different* committed aesthetic directions, one screenshot each. Pick with your eyes, `squint variants apply <id>`.

## Install

```sh
npm install -g @aayambansal/squint   # then just: squint
npx @aayambansal/squint              # or run without installing
```

From source:

```sh
git clone https://github.com/aayambansal/squint.git
cd squint
npm install && npm run build && npm link
```

You need at least one engine installed (`squint doctor` shows what's found):

| Engine | id | Install |
| --- | --- | --- |
| Claude Code | `claude` | `npm i -g @anthropic-ai/claude-code` |
| Codex CLI | `codex` | `npm i -g @openai/codex` |
| Gemini CLI | `gemini` | `npm i -g @google/gemini-cli` |
| OpenCode | `opencode` | `npm i -g opencode-ai` |
| Amp | `amp` | `npm i -g @sourcegraph/amp` |
| Cursor CLI | `cursor` | `curl https://cursor.com/install -fsS \| bash` |
| Copilot CLI | `copilot` | `npm i -g @github/copilot` |
| Aider | `aider` | `pip install aider-install && aider-install` |

API keys stay wherever your agent CLIs already read them — squint stores no secrets.

## Use

**Start fresh** (Lovable-style, from nothing):

```sh
squint init my-app        # Vite + React + TS + Tailwind v4, token-first CSS
cd my-app && squint       # open the TUI, describe what to build
```

**Or on any existing repo:**

```sh
cd your-project && squint
```

**Headless / scriptable:**

```sh
squint run "add a dark mode toggle to the navbar"
squint run -e codex -m gpt-5 "tighten the hero spacing"
squint run --json "…"             # normalized ndjson events for scripting
squint check                      # quality gates: typecheck → lint → test → build
squint shot http://localhost:5173 # screenshots at 390/768/1440
squint brief                      # list design directions; squint brief terminal commits one
squint engines                    # what's installed
squint doctor                     # engines + Chrome + WebSocket check
squint tag                        # add the Alt+S element picker to any Vite app
squint variants gen 3 "<ask>"     # 3 parallel design explorations (3 engine runs)
squint variants apply terminal    # keep the winner, discard the rest
```

**Commit a design direction** so every session holds the same look:

```sh
squint brief                 # editorial-minimal · terminal · warm-editorial · data-dense
                             # cinematic-dark · playful · brutalist
squint brief cinematic-dark  # writes .squint/brief.md — plain markdown, made to remix
```

**Configure** (global `~/.config/squint/config.json`, per-repo `.squint/config.json`):

```sh
squint config set engine claude
squint config set models.claude claude-sonnet-5
squint config set autoDev true              # start the dev server with the TUI
squint config set autoFix true              # auto-send build/runtime errors back (max 2 tries)
squint config set autoProbe false           # disable the post-turn runtime probe
squint config set --project engine codex    # per-repo override
```

**Inside the TUI:**

| Command | What it does |
| --- | --- |
| `/dev` | start/stop the project dev server (auto-detected script + package manager) |
| `/check` | run quality gates |
| `/fix` | send captured errors / failed gates to the engine |
| `/shot` | screenshot the app at mobile/tablet/desktop |
| `/review [focus]` | screenshots + the engine critiques its own rendered work, then fixes it |
| `/undo` | revert the whole last ask (your own uncommitted work survives) |
| `/resume` | pick the previous session back up after a restart |
| `/engine <id>` · `/model <name>` | switch backend or model mid-session |
| `/clear` | new session |
| `Esc` | interrupt the running turn · `↑/↓` prompt history |

## Design decisions

- **Engines are dumb translators.** Each adapter is ~80 lines: build a headless invocation, parse the stream into one normalized event model. Claude Code, Amp, and Cursor share a single wire-protocol parser. All product behavior lives in the harness, so adding an engine is cheap.
- **The brief is the product.** Direction-before-code, token-first, banned-tells — encoded from research (`docs/research/`), not vibes.
- **Zero-dependency eyes.** Screenshots use Chrome's own one-shot headless mode — no Playwright/Puppeteer install.
- **Sessions resume** where engines support it (Claude `--resume`, Codex `exec resume`, OpenCode `--session`, Amp threads, Cursor chats).

## Roadmap

- npm distribution
- Variants inside the TUI with an inline picker
- Deeper gates: axe accessibility audits, Lighthouse budgets, visual regression baselines

Architecture notes in `docs/design/`, research base in `docs/research/`.

## License

MIT © Aayam Bansal
