# Changelog

## 0.4.3 — 2026-07-26

- Version-aware rule-packs: v3-era Tailwind written into a v4 project (and retired Vite idioms) caught at gate time with the exact rename as the fix prompt; renamed-scale traps (shadow-sm and friends) surface as advisory verify-intent pressure
- /context — the injection bill itemized: every context source costed in tokens with when it fires, plus warnings for stale locks, near-universal skill triggers, and oversized always-on context

## 0.4.2 — 2026-07-26

- Phantom-class check: DOM class tokens with no CSS rule are elements silently unstyled — the deterministic catch for hallucinated/version-mismatched utilities; filed as problems with element pointers
- Design-decision ledger: .squint/design-log.jsonl records decisions at the moments squint owns (/decide, variant chosen, rollback, sandbox accepted) with screenshot evidence; the recent ledger rides into every ask
- docs/research/wave-3.md: the fifth sweep and its ranked 12

## 0.4.1 — 2026-07-26

- Flow verbs: hover (selector or visible text), scroll (bottom/top/selector), wait (capped, validated)
- squint init ships a starter flow so /flows verifies new apps from the first turn

## 0.4.0 — 2026-07-26

The verification release — wave 2 complete:

- Declared flows: .squint/flows/*.flow user journeys (goto/click/fill/press/expect/shot) replayed headlessly by /flows; failures name the exact step and join the fix loop
- /score: deterministic quality snapshot (problems, a11y, distinctiveness tells, runtime, LCP)
- fixModel cheap-tier routing; /find search; screen-reader narration; registry-aware prompts; harness hooks; /polish; /btw; perf pulse; token drift guard; anti-slop detection; inline terminal screenshots

## 0.3.4 — 2026-07-26

- fixModel: auto-fix and /fix turns route to a cheaper model tier while real asks keep the session model
- /find <term>: search the live session and saved transcripts

## 0.3.3 — 2026-07-26

- Screen-reader narration pass: the AX tree linearized into what assistive tech experiences, judged in /review
- Registry-aware prompts: components.json repos get their real installed UI components enumerated in every ask

## 0.3.2 — 2026-07-26

- Harness hooks: .squint/hooks/{on-turn-end,on-pulse-diff,on-problem,on-budget} fire with SQUINT_* env — quality events no engine emits
- /polish [1-5]: unattended rounds of screenshot → critique → fix

## 0.3.1 — 2026-07-26

- Perf pulse: LCP/CLS/transfer/request deltas per clean turn — bundle bloat shows the turn it happens
- Token drift guard: hardcoded colors in a turn's additions get pointed at the nearest existing token (deterministic, per turn)
- /btw <question>: read-only side questions; the main thread's context is untouched

## 0.3.0 — 2026-07-26

The harness that sees, now in the terminal:

- Inline screenshots: on kitty/Ghostty/WezTerm/iTerm2 the visual pulse and captures render as real pixels in the transcript (Static-region placement sidesteps the repaint problem that keeps other agent CLIs text-only)
- Anti-slop detector: generic font stacks, purple-gradient heroes, identical card grids, emoji bullets, untouched shadcn defaults — flagged mechanically, fed to /review as distinctiveness debt
- Failing tool results surface in the transcript; queue is editable (/queue drop <n>); totals survive /resume
- docs/research/next-wave.md: the fresh ecosystem sweep and the wave-2 program

## 0.2.9 — 2026-07-26

- squint sandbox CLI (diff/apply/discard); sandbox worktree auto-gitignored
- /shot accepts any URL; grouped /help; docs/loops.md explains every automatic loop
- Version ships from package.json (build-time injection)

## 0.2.8 — 2026-07-26

- Sandbox mode: /sandbox on accumulates asks in a shadow worktree (engines, gates, dev server all run there); diff / apply / discard
- With this, every actionable item from the feature-mining research ranked list has shipped

## 0.2.7 — 2026-07-26

- autoReview: with it on, a clean turn whose visual pulse shows 10%+ change triggers the self-critique review automatically (once per ask)
- /dev restart and /dev logs
- CLI internals split into focused modules (behavior unchanged)

## 0.2.6 — 2026-07-26

- Gemini adapter streams events (stream-json, defensively parsed)
- Dev server auto-restarts once after a crash; manual stops never restart
- Engines table shows streaming/resume traits; /engines works inside the TUI

## 0.2.5 — 2026-07-26

- Modes mapped on all eight engines (opencode plan agent, aider --dry-run, copilot approval drop, amp yolo)
- --mode on squint run; prettier format gate; light theme + OSC 11 terminal-background auto-detection
- docs: engine setup guide + configuration reference

## 0.2.4 — 2026-07-26

- Route-aware review: .squint/routes extends /shot and /review beyond the root (desktop shot per route, capped at 6)
- Long tool bursts collapse to first three + a counter
- budgetUsd config: one-time warning when session spend crosses your line

## 0.2.3 — 2026-07-26

- Slash-command autocomplete: typing / lists commands with descriptions, tab completes (one registry powers /help too)
- /save exports the transcript as markdown to .squint/transcripts/
- .squint/locks: paths the engine must never modify, injected as a hard constraint

## 0.2.2 — 2026-07-26

- Visual pulse: every clean probe screenshots the app and reports cross-turn drift (pixel diff runs inside Chrome, no dependencies)
- Problems list: gates/dev/runtime/a11y findings aggregate; /problems lists, /fix batches all, /fix <n> targets one; footer count
- Measured diff stat in the done line (3 files +42 −7 via git)
- /copy last reply to the clipboard; idle hints on the empty screen

## 0.2.1 — 2026-07-26

- Multi-pin annotations in the element picker: pin several elements with notes, alt+enter compiles one numbered blob
- Repo skills: .squint/skills/*.md inject on trigger match, .squint/rules.md always-on; squint skills list/init
- /variants inside the TUI (gen/apply/list/clean with per-family streaming status)
- squint doctor --probe verifies each engine end to end and surfaces the actionable error line

## 0.2.0 — 2026-07-26

The architecture release: squint rebuilt around a framework-free session core, informed by deep research into gemini-cli, opencode, crush, dyad, Cline, and friends (docs/research/).

- Session core extracted from the TUI: transcript, turn orchestration, fix loops, commands, and totals in one tested engine; the Ink app is a thin view
- Real line editor: cursor movement, word jumps (alt+arrows), ctrl+a/e/k/u/w, mid-line editing, block cursor
- Prompt queue: keep typing while the agent works; asks dispatch in order; /queue clear
- Run modes: plan / safe / yolo, per-engine mapping, shift+tab cycling, footer badge
- autoCheck: typecheck+lint run after every turn and auto-fix (capped) before any browser feedback
- Checkpoint stack: /undo pops, /restore <n> rewinds, /checkpoints lists
- Markdown transcript rendering (headings, lists, quotes, fenced code) — streaming-forgiving
- Themes: amber/ocean/moss/rose/mono, /theme, NO_COLOR support
- Per-turn telemetry (edits · cost · seconds in the done line), session totals in the footer, completion bell
- Two-step ctrl+c with a session summary; per-tool glyphs; rotating working phrases
- CI hardening: Chrome flake-proofing; every PR merges only on green

## 0.1.3 — 2026-07-26

- New README banner

## 0.1.2 — 2026-07-26

- Contact routes through GitHub (private vulnerability reporting, profile) instead of a raw email address
- Major dependency refresh: zod 4, ink 7, commander 15, TypeScript 7, vitest 4; Node floor is now ≥ 22

## 0.1.1 — 2026-07-26

- Accessibility sweep in the capture pass: dependency-free in-page audit (alt text, accessible names, label association, document lang/title, heading order, tap-target size, positive tabindex) surfaced by `/shot` and folded into `/review`
- README rebuilt with the ASCII banner + full diagrams; CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, CODEOWNERS, dependabot

## 0.1.0 — 2026-07-26

First release. `npm i -g @aayambansal/squint` or `npx @aayambansal/squint`.

- Eight engines driven headlessly behind one normalized event stream: Claude Code, Codex CLI, Gemini CLI, OpenCode, Amp, Cursor CLI, Copilot CLI, Aider — with token-level streaming and session resume where supported
- Design-brief prompt enrichment on every ask; seven committable aesthetic directions (`squint brief`)
- Dev-server manager with build-error feedback (`/fix`, capped `autoFix`)
- Automatic post-turn runtime probe via CDP: console errors, uncaught exceptions, failed requests
- Screenshot self-critique at mobile/tablet/desktop (`/shot`, `/review`)
- Quality gates: typecheck → lint → test → build (`squint check`, `/check`)
- Element picker (`squint tag`, pre-wired by `squint init`): Alt+S, click, paste
- Parallel design variants in git worktrees (`squint variants gen/apply/clean`)
- Whole-ask `/undo` via git snapshots; `/resume` across restarts
- `squint init`: embedded Vite + React + TS + Tailwind v4 starter, token-first CSS
- Ink TUI with static-scrollback transcript, Esc interrupt, prompt history; headless `run` with `--json`
