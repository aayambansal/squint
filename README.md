<div align="center">

<pre>
▄▄▄▄▄                                                         ▄▄                       
  ▄▄█▀█▓▀██▄▄    ▄▄▓████▄▄▄       ▄▄     ▄▄▄   ▄▄▄▄▄▓ ▄▄▄▄▄     ▄▄▄▀▓▌      ▄▄▄▄▄▄▄████
 █████▓▀▀█▓█▀  ▄▄████▄▓█████    ▄▄█▌     ▐███  ▐███▄█ ██████    █████▌ ▄▄▄█████▓█████▀ 
 █▓█▄█▄    ▀  ▒▓██▓▀    ▀█▄██  ▒▓██▌     ▐█▄██ ▐█▓█▄█ ███▄██▄▄  ▐▓▄▓█▌▄████▄██▄██      
  ▀▀██▓▄▄    ░▓███▌      ▐██▓▌░▓███▌      ▐██▓▌▐▓███▌ ▐██████▓▓▄▐█▓███     ▐███▓█      
    ▀█████░░▄▐████▌ ▄▄▄▄ ▐███▌▐████▌      ▐███▌▐████▌▌▐█████████▓████▒      ▐███▌      
 ▐█▄    ▓█▄▄▌ ▐███▓▄ ▀███▓██▌  ▐███▓▄    ▄▓██▌  ▐███▌ ▐████▌▀▀███████░      ▐████▌     
▓██████████▓▌ ▀█████▓███████   ▀█████▓███████   █████ ▐████▌  ▀█▓▓████      ▐▓████     
 ▀▀▀▓█████▀▀    ▀▀▀▀████▀███▄▄   ▀▀▀▀████▀▀     ▐▀███ ▐███▓▌    ▀███▀▓       ▓███▀▌    
                                                                             ▀▀        
</pre>

### Lovable for your terminal

Any repo. Any coding agent. The whole loop, owned by you.

[![npm](https://img.shields.io/npm/v/%40aayambansal%2Fsquint?color=2f5fe0)](https://www.npmjs.com/package/@aayambansal/squint)
[![ci](https://github.com/aayambansal/squint/actions/workflows/ci.yml/badge.svg)](https://github.com/aayambansal/squint/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-1a1a1a)](./LICENSE)
[![Engines](https://img.shields.io/badge/engines-8-2ea44f)](#engines)
[![PRs](https://img.shields.io/badge/PRs-welcome-2f5fe0)](./CONTRIBUTING.md)

</div>

---

squint is a frontend harness that sits on top of the coding agents you already have — Claude
Code, Codex CLI, Gemini CLI, OpenCode, Amp, Cursor CLI, Copilot CLI, Aider — and turns them
into a design-obsessed app builder that works on any repo, local-first.

Lovable proved the loop: prompt, generate, preview, auto-fix, iterate. But it's a closed SaaS.
You can't point it at an existing codebase, choose your agent or model, or own the loop.
squint is that missing layer, in your terminal. No cloud project, no lock-in, no secrets
stored — API keys stay wherever your agent CLIs already read them.

## Run it

```sh
npx @aayambansal/squint              # run without installing
npm install -g @aayambansal/squint   # or install; then just: squint
```

Start from nothing, like Lovable:

```sh
squint init my-app        # Vite + React + TS + Tailwind v4, token-first CSS
cd my-app && squint       # open the TUI, describe what to build
```

Or on any existing repo:

```sh
cd your-project && squint
```

From source: `git clone https://github.com/aayambansal/squint.git && cd squint && npm install && npm run build && npm link`.

## The loop

```
  you describe ---> design brief ---> engine ---> edits land in your repo
       ^                                               |
       |                 +-----------------------------+
       |                 |  dev server     build errors caught
       |                 |  CDP probe      exceptions . console . 404s
       |                 |  a11y sweep     alt text . labels . headings
       |                 |  screenshots    390 / 768 / 1440
       |                 +-----------------------------+
       |                        |               |
       +--- /undo reverts    /fix (auto)    /review: the agent
            /variants explores               critiques what it SEES
```

1. **You describe.** Every ask is wrapped in squint's design brief — built from studying
   Lovable's leaked prompts, v0's design rules, and the documented catalog of AI-slop tells:
   direction before code, tokens are the system, banned generic patterns. Override per
   project with `.squint/brief.md`.
2. **Your agent builds.** squint drives whichever engine you choose, headlessly, streaming
   token by token.
3. **The dev server judges.** Build errors after every turn route straight back to the
   engine (`/fix`, or automatic with `autoFix`).
4. **The runtime is watched.** After every clean turn squint loads the page headlessly (~2s)
   and catches what the server never prints: blank pages, exceptions, failed requests.
5. **The agent looks at its work.** `/review` screenshots mobile/tablet/desktop and
   re-prompts the engine to critique what it can see — then fix it.
6. **Gates keep it honest.** Typecheck + lint run automatically after *every* turn and
   auto-fix (capped); `/check` adds tests and the build — failures come back with orders
   not to weaken the checks.
7. **Everything is reversible.** Every ask records a checkpoint; `/undo` pops the last,
   `/restore <n>` rewinds files to any earlier point — your own uncommitted work survives.
8. **Point at things.** Alt+S in the browser, click any element, and a self-locating
   reference lands on your clipboard to paste into squint.
9. **Explore in parallel.** `squint variants gen 3 "<ask>"` builds the same ask three ways —
   three worktrees, three committed aesthetic directions. Pick with your eyes.

## Engines

| engine | id | install |
| --- | --- | --- |
| Claude Code | `claude` | `npm i -g @anthropic-ai/claude-code` |
| Codex CLI | `codex` | `npm i -g @openai/codex` |
| Codex (app-server) | `codex-app` | same binary — drives the published JSON-RPC protocol |
| Gemini CLI | `gemini` | `npm i -g @google/gemini-cli` |
| Antigravity CLI | `antigravity` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |
| OpenCode | `opencode` | `npm i -g opencode-ai` |
| Amp | `amp` | `npm i -g @ampcode/cli` |
| Cursor CLI | `cursor` | `curl https://cursor.com/install -fsS \| bash` |
| Copilot CLI | `copilot` | `npm i -g @github/copilot` |
| Aider | `aider` | `pip install aider-install && aider-install` |

`squint doctor` shows what's found. One engine is enough; session resume works everywhere
the backend supports it (Claude, Codex, OpenCode, Amp, Cursor).

## Commands

```sh
squint                            # the TUI, in the current repo
squint run "add a dark mode toggle"
squint run -e codex -m gpt-5 "tighten the hero spacing"
squint run --json "..."           # normalized ndjson events for scripting
squint check                      # gates: typecheck -> lint -> test -> build
squint shot http://localhost:5173 # screenshots at 390/768/1440
squint brief                      # list design directions
squint brief cinematic-dark       # commit one for this repo
squint tag                        # Alt+S element picker: pin elements + notes, alt+enter copies all
squint variants gen 3 "<ask>"     # 3 parallel design explorations
squint variants apply terminal    # keep the winner
squint skills init                # scaffold .squint/rules.md + a trigger-matched skill
squint config set engine claude
squint config set models.claude claude-sonnet-5
squint config set autoDev true    # dev server starts with the TUI
squint config set autoFix true    # errors auto-route back (max 2 tries)
squint config set autoCheck false # skip the per-turn typecheck+lint pass
squint config set autoReview true # big visual change → automatic self-critique
squint config set fixModel haiku  # mechanical fix turns run on the cheap tier
squint config set theme ocean     # amber · ocean · moss · rose · mono
squint config set bell false      # no bell on turn completion
squint doctor                     # engines + Chrome + WebSocket check
squint doctor --probe             # run every engine end to end, verify auth actually works
```

**Inside the TUI:**

- **Modes**: `shift+tab` cycles `safe` (edits auto-approved) → `plan` (read-only
  investigation) → `yolo` (no friction), mapped to each engine's native permission flags.
- **Type ahead**: keep typing while the agent works — Enter queues asks that dispatch in
  order; `/queue clear` drops them. `Esc` interrupts the current turn.
- **Editing**: a real line editor — arrows move, `alt+←/→` jump words, `ctrl+a/e/k/u/w`,
  `↑/↓` history. `ctrl+c` twice exits with a session summary.
- **Flows**: declare user journeys as six readable lines in `.squint/flows/`; `/flows`
  replays them headlessly and failing steps join the fix loop; `/flows suggest` drafts
  a smoke flow per route from the live page's own headings. Journeys report
  per-transition soft-nav timings (Chrome 151+) and retained detached DOM — the leak
  pulse. `/score` snapshots quality
  deterministically. `/goal <objective>` arms a standing goal — auto-fix presses to 6
  attempts until squint's checks come back clean.
- **Problems**: findings from gates, the dev server, the runtime probe, a11y sweeps, and flows
  collect into a list — `/problems` shows it, `/fix` sends everything as one turn,
  `/fix <n>` targets one. The footer counts what's open.
- **Sandbox**: `/sandbox on` and asks accumulate in a shadow worktree — the dev server,
  gates, and probes all run there; `/sandbox diff` shows what is staged, `apply` lands it
  as one diff, `discard` walks away with the real tree untouched.
- **Variants without leaving**: `/variants 3 <ask>` runs parallel explorations with
  streaming per-family status; `/variants apply <id>` keeps the winner.
- **Commands**: type `/` and matching commands appear with descriptions; tab completes.
  `/dev` `/check` `/problems` `/fix [n]` `/shot` `/review [focus]` `/variants` `/undo`
  `/checkpoints` `/restore <n>` `/mode` `/theme` `/copy` `/save` `/resume` `/clear`.
- **The harness sees, in your terminal**: on kitty/Ghostty/WezTerm/iTerm2, pulse and
  capture screenshots render as real pixels inside the transcript. Every clean turn is
  pixel-compared with the last (drift as a number), load performance is tracked with
  deltas (`perf: LCP 812ms (+420ms)`), hardcoded colors get pointed at the nearest
  design token, and the mechanical anti-slop sweep flags generic-AI tells as
  distinctiveness debt in `/review` — alongside dark-pattern tripwires (preselected
  consent, buried decline buttons), print leakage, and forced-colors blindness. The
  phantom-class check diffs every DOM class against the compiled CSS — hallucinated
  utilities surface as named problems instead of silently unstyled elements — and
  version-aware rule-packs catch Tailwind v3 muscle memory in v4 projects at gate
  time, rename in hand. The locale pulse names the elements real translations will
  truncate (+40% pseudo-localization) and catches text-align:left hardcodes under RTL. view-transition breakage (duplicate names, missing reduced-motion handling) is
  flagged from the live page, and on Next 16+ the framework's own `/_next/mcp`
  channel feeds structured errors straight into the fix loop. `/context` itemizes
  the injected-context bill per source, with staleness warnings.
- **Two more doors in**: `squint mcp` serves the gates as MCP tools (any
  MCP-speaking agent calls squint's verification directly); `squint ci` runs the
  whole loop headlessly in a pipeline — JSON report, non-zero exit on hard findings,
  and a digest-sealed receipt per run at `.squint/receipts/` tying the green claim
  to the exact pixels it was green about.
- **The review lane**: `/lane on` — every ask gets a second read-only reviewer in
  fresh context over the diff alone; blind spots don't inherit.
- **The sentinel**: gate evasion (deleted tests, added skips, suppressed
  diagnostics, weakened checks, locked-path touches) detected deterministically per
  turn and reported to you — never sent back to the engine that did it.
- **Detachable sessions**: `squint serve` owns the session on a unix socket;
  `squint attach` joins from any terminal (observer seats for teammates, driver
  seat inherited on detach). Crash-proof, ssh-friendly, no cloud.
- **Persistent checks**: assertions the engine verifies once persist as
  `.squint/checks/*.js` and replay against the live page every turn — one-off
  verifications compound into repo-versioned regression checks.
- **Visual approval**: engines ask before contested changes — the request renders
  with its screenshot, `/yes` / `/no` answer it, the ledger remembers. Under
  `squint serve` with `approvalWebhook` set, approvals reach your phone as signed
  one-shot URLs.
- **The design ledger**: `/decide` (plus chosen variants, rollbacks, accepted
  sandboxes, approvals) appends to a committed `.squint/design-log.jsonl`; recent
  decisions ride into every ask so they stop getting silently undone between
  sessions. `/distill` compresses the ledger into always-on rules and proposed
  persistent checks — accumulated taste becomes deterministic gates.
- **`/btw <question>`** asks about the codebase read-only without touching the main
  thread's context. `.squint/locks` lists paths the engine must never touch; `/save`
  exports the transcript as markdown.
- Assistant output renders as markdown; the done line measures real work via git
  (`3 files +42 −7`); the footer tracks session turns and cost; a bell rings when a
  turn finishes.

**Project knowledge** rides along automatically: `.squint/rules.md` on every ask, and
`.squint/skills/*.md` (frontmatter `triggers: auth, login`) only when an ask mentions a
trigger — deterministic context routing, no embeddings.

## Design directions

`squint brief` writes a committed direction to `.squint/brief.md` so every session holds the
same look. Seven families, organized by aesthetic rather than industry — the researched
cheapest route to non-generic work:

```
editorial-minimal   terminal   warm-editorial   data-dense
cinematic-dark      playful    brutalist
```

Each is a concrete commitment — type pairing, color strategy, spacing rhythm, motion stance,
and an avoid-list tuned to that family's failure modes. Plain markdown, made to be remixed.

## How it fits together

```
        tui (ink)            cli (run / check / shot / variants ...)
            \                              /
             `-----------+---------------'
                         |
             +------------------------+
             |    squint harness      |   brief . gates . fix loops
             |   prompt enrichment    |   snapshots . sessions
             +-----+------------+-----+
                   |            |
        +----------+---+    +---+---------------------+
        | engine layer |    | eyes                    |
        | 8 adapters,  |    | dev-server watcher      |
        | one event    |    | CDP runtime + a11y      |
        | stream       |    | headless screenshots    |
        +------+-------+    +-------------------------+
               |
   claude . codex . codex-app . gemini . antigravity . opencode . amp . cursor . copilot . aider
```

Engines are dumb translators: build a headless invocation, parse the stream into one
normalized event model. Claude Code, Amp, and Cursor share a single wire-protocol
parser; `codex-app` speaks the app-server JSON-RPC protocol through an embedded driver.
All product behavior lives in the harness, so a new engine is ~80 lines.

## Repo layout

| path | what it is |
| --- | --- |
| `src/engines` | 8 adapters + the shared Claude wire-protocol parser |
| `src/runner` | subprocess spawn → normalized event stream, abort support |
| `src/prompt` | the design brief + 7 aesthetic families |
| `src/devserver` | dev-server manager + build-error detection |
| `src/preview` | Chrome discovery, CDP client, screenshots, a11y sweep |
| `src/gates` | quality gates (typecheck / lint / test / build) |
| `src/tagger` | the Alt+S element picker (embedded Vite plugin) |
| `src/variants` | parallel exploration worktrees |
| `src/scaffold` | the `squint init` template |
| `src/vcs` | `/undo` git snapshots |
| `src/state` | per-project session persistence |
| `src/tui` | the Ink app |
| `docs/research` | the knowledge base squint is built from |

## Docs

- [Engine setup guide](./docs/engines.md) — install + auth for all eight, and how to choose
- [Configuration](./docs/configuration.md) — every key, every `.squint/` file
- [The loops](./docs/loops.md) — everything that runs automatically around each turn
- [Architecture](./docs/design/2026-07-25-architecture.md)
- [How Lovable works under the hood](./docs/research/lovable.md)
- [Making agents produce excellent frontend work](./docs/research/frontend-quality.md)
- [Engine headless interfaces + TUI stack](./docs/research/engines-and-tui.md)
- [Changelog](./CHANGELOG.md)

## Contributing

Built in the open, moving fast. Every change ships as a pull request with CI green. See
[CONTRIBUTING.md](./CONTRIBUTING.md) — adding an engine adapter is the best first issue
there is.

## License

[MIT](./LICENSE) © Aayam Bansal. Take it, run it, ship it.
