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
waits 1.5s for the rebuild, then sweeps for fresh errors. Crashes get one automatic
restart; a second crash is a human's job.

## 3. Runtime probe — `autoProbe` (default on)

When the sweep is clean, squint loads the page headlessly (~2s, CDP) and catches what
the server never prints: blank pages, uncaught exceptions, console errors, failed
requests. `/shot` and `/review` add the accessibility sweep (alt text, labels,
accessible names, heading order, tap targets) and cover `.squint/routes`.

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

## Hooks

Drop executables in `.squint/hooks/` and squint fires them (SQUINT_* env, 10s cap,
never blocking): `on-turn-end` (SQUINT_COST, SQUINT_DURATION_MS, SQUINT_STAT),
`on-pulse-diff` (SQUINT_PCT), `on-problem` (SQUINT_SOURCE, SQUINT_SUMMARY),
`on-budget` (SQUINT_TOTAL, SQUINT_BUDGET). Ring a bell, post to Slack, trigger CI —
these are quality events no engine emits on its own.

## Turning things off

```sh
squint config set autoCheck false   # no per-turn gates
squint config set autoProbe false   # no runtime probe or pulse
squint config set autoFix false     # problems wait for /fix (default)
squint config set autoReview false  # no automatic self-critique (default)
```
