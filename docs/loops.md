# The loops

Everything squint runs automatically around each engine turn, in order, and how to
steer it. This is the product: coding agents write frontend code well when something
keeps checking.

```
  your ask
     │  + design brief (first turn) + rules.md + locks + trigger-matched skills
     ▼
  engine turn ──────────────── esc interrupts · typing queues the next ask
     │
     ▼
  1. fast gates          typecheck + lint (seconds, deterministic)
     │ fail → problem → auto-fix (capped) or /fix
     ▼
  2. dev server sweep    fresh build errors since the turn started
     │ fail → problem → auto-fix or /fix
     ▼
  3. runtime probe       page loaded headlessly: exceptions, console, 404s
     │ fail → problem → auto-fix or /fix
     ▼
  4. visual pulse        pixel diff vs last turn's screenshot
     │ big change + autoReview → the engine critiques its own work
     ▼
  done · 41s · $0.18 · 3 files +42 −7
```

## 1. Fast gates — `autoCheck` (default on)

After every turn, the typecheck and lint subset runs (project scripts, or `tsc --noEmit` /
`eslint .` fallbacks). Failures register as a **problem** with the diagnostics attached.
The slow gates (format, test, build) stay behind `/check` and `squint check`.

## 2. Dev server sweep — always on when the server runs

squint owns the dev server (`/dev`, or `autoDev`), ring-buffers its output, and tags
error lines across the vite/esbuild/webpack/next/tsc vocabularies. After each turn it
waits 1.5s for the rebuild, then sweeps for fresh errors. On Next 16+ projects the
sweep also asks the framework itself: squint speaks MCP to the dev server's
`/_next/mcp` endpoint and merges its structured build/runtime errors in ahead of the
log scrape. Crashes get one automatic
restart; a second crash is a human's job.

## 3. Runtime probe — `autoProbe` (default on)

When the sweep is clean, squint loads the page headlessly (~2s, CDP) and catches what
the server never prints: blank pages, uncaught exceptions, console errors, failed
requests. `/shot` and `/review` add the accessibility sweep (alt text, labels,
accessible names, heading order, tap targets) and cover `.squint/routes`.

The probe also runs the **phantom-class check**: every class token in the DOM is diffed
against the compiled stylesheet's selectors. Present in the markup but absent from the
CSS means the element is silently unstyled — the classic tell of a hallucinated or
version-mismatched utility (Tailwind v3 names in a v4 project). Phantoms are filed as
problems with element pointers, so "why did nothing change" becomes a named class.

Its static twin runs with the fast gates: **version-aware rule-packs** diff the turn's
added lines against the project's own toolchain majors. Tailwind v3 classes in a v4
project (`bg-gradient-to-r`, `flex-shrink-0`) become problems carrying the exact
rename; still-valid-but-shifted classes (`shadow-sm` now one step larger) surface as
verify-intent advisories. Silent unless package.json says the newer major is in play.

The probe also audits **view transitions**: duplicate `view-transition-name` values
(the browser silently skips the entire transition) become problems with element
pointers, and declared transitions with no `prefers-reduced-motion` handling surface
as advisories in `/review`. On React dev pages the **fiber probe** walks
`__reactFiber$` chains from landmark elements and hands `/review` a component map
(`h1 — Hero < App`), so critiques name the component an issue lives in.

## 4. Visual pulse + `autoReview` (pulse always; review default off)

Every clean probe screenshots the page and pixel-compares it with the previous turn
(inside Chrome, sampled). Drift shows as a number: `visual pulse: 7.3% of the page
changed vs last turn`. With `autoReview true`, a change of 10%+ triggers the full
self-critique review automatically, once per ask.

## The fix cycle

Problems from any loop share one budget: with `autoFix true`, squint sends **all open
problems** back to the engine, at most **2 attempts per ask**, with orders to fix root
causes rather than weaken checks. Manually: `/problems` lists, `/fix` sends all,
`/fix <n>` targets one. Problems clear themselves when their source comes back clean.

## Safety rails around every loop

- A **checkpoint** precedes every ask: `/undo` pops it, `/restore <n>` rewinds deeper.
- **Sandbox mode** (`/sandbox on`) redirects everything — engine, gates, dev server,
  probes — into a shadow worktree until you `apply` or `discard`.
- `budgetUsd` flags runaway session cost; Esc interrupts any turn instantly.

## Persistent checks

When the engine verifies something about the page that should stay true, every ask
teaches it to persist the assertion as `.squint/checks/<name>.js` — plain JS that
evaluates in the probed page to an array of failure strings (empty = pass). squint
replays every check after every turn; failures join the problems list with orders to
fix the page, not weaken the assertion. One-off verifications compound into
repo-versioned regression checks. Write your own too — they run the same way.

## Visual approval

Every ask teaches the engine one escape hatch: for a visual decision it should not
make alone (a redesign direction, reversing a decision on record), write
`.squint/approval-request.json` and end the turn. squint renders the request —
screenshot inline on capable terminals — and blocks on your verdict: `/yes [note]`
approves, `/no [note]` rejects, either way the outcome joins the design ledger and
rides back to the engine as the next message.

## The design ledger

Decisions evaporate between sessions; `.squint/design-log.jsonl` (committed, not
ignored) is where they survive. squint appends an entry at each moment a decision
actually happens — `/decide <text>` records one explicitly, applying a variant records
the direction you chose, `/restore` records what you rejected, applying a sandbox
records what you accepted — with the current pulse screenshot as evidence when there is
one. The most recent entries ride into every ask as standing decisions the engine must
not silently undo. Memory with receipts.

## Flows and the score

`.squint/flows/<name>.flow` declares a user journey in readable lines (`goto /signup`,
`click Sign up`, `fill #email me@x.com`, `press Enter`, `expect Check your inbox`,
`shot done`). `/flows` replays every journey headlessly — passes show step counts and
screenshots inline; a failing step names its exact position and joins the problems list.
Ask the engine to write flows for you.

`/score` composes a deterministic 0-5 snapshot from what squint measures (open problems,
a11y findings, distinctiveness tells, runtime state, LCP). Judgment stays with `/review`.

## Hooks

Drop executables in `.squint/hooks/` and squint fires them (SQUINT_* env, 10s cap,
never blocking): `on-turn-end` (SQUINT_COST, SQUINT_DURATION_MS, SQUINT_STAT),
`on-pulse-diff` (SQUINT_PCT), `on-problem` (SQUINT_SOURCE, SQUINT_SUMMARY),
`on-budget` (SQUINT_TOTAL, SQUINT_BUDGET). Ring a bell, post to Slack, trigger CI —
these are quality events no engine emits on its own.

## `/context` — the injection bill

Everything above rides on injected context, which is squint's edge and its silent
failure mode. `/context` itemizes it: every source (brief, rules, design ledger,
component inventory, locks, each skill) with estimated tokens and exactly when it
fires, an always-on total, and warnings for stale locks, skill triggers generic enough
to match any ask, and always-on context past the attention budget.

## Turning things off

```sh
squint config set autoCheck false   # no per-turn gates
squint config set autoProbe false   # no runtime probe or pulse
squint config set autoFix false     # problems wait for /fix (default)
squint config set autoReview false  # no automatic self-critique (default)
```
