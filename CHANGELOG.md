# Changelog

## 0.9.6 — 2026-07-27

- Container-query and anchor-positioning disconnect checks: dead @container rules, containers without rules, and position-anchor targets nothing declares — the write-the-CSS-forget-the-wiring class, named with the fix
- Flows report wall-clock duration in the TUI and MCP tool

## 0.9.5 — 2026-07-27

- `squint ci --compare`: every pipeline run diffs against the previous sealed receipt — regressions print red and fail the run
- `/fix <source>`: target one problem stream (a11y, dev, check, …)

## 0.9.4 — 2026-07-27

- `squint receipts [compare]`: list sealed runs; diff the two newest — gate flips, hard-finding deltas, flow regressions — digests verified first, non-zero exit on regression
- Fake-button check: div-onclick UI with no role and no tabindex flags as mouse-only
- /score prices every signal family: hard findings half a point, advisories an eighth

## 0.9.3 — 2026-07-27

- Fix: slash commands typed in an attached TUI were queued as engine asks instead of executed — RemoteSession now routes them as commands, matching the plain attach
- /save exports end with the design decisions on record and a receipts pointer — a reviewed artifact, not a chat log

## 0.9.2 — 2026-07-26

- Shared verdicts: observer seats answer approvals and record decisions (/yes, /no, /decide) with seat attribution in the shared transcript; steering stays with the driver
- A footer badge while an approval waits (⏸ approval waiting — /yes or /no)

## 0.9.1 — 2026-07-26

- Speculation-rules check: invalid rule sets (silently disabled speculative loading), failed prefetches, and failed prerenders report via the CDP Preload domain

## 0.9.0 — 2026-07-26

- The approval relay: with `approvalWebhook` configured, engine approval requests under `squint serve` POST to your webhook with signed one-shot approve/reject URLs — answer /yes or /no from your phone; tokens burn on use; the ledger records webhook attribution
- pendingApproval joins public session state (visible to every attached terminal)

## 0.8.2 — 2026-07-26

- Deceptive-design check: preselected consent, urgency-countdown theater, visually buried decline buttons, and confirmshaming flag into the slop stream (the DOM-checkable subset of the 19-principle taxonomy)
- Leak pulse: detached DOM retained by JS reports after every flow journey with top tag counts — the memory category no harness covers

## 0.8.1 — 2026-07-26

- Locale pulse: pseudo-localization (+40% expansion) names the elements real translations will truncate; dir=rtl catches text-align:left hardcodes and RTL overflow — zero translation infrastructure
- Forced-colors sweep: interactive text that goes invisible under Windows High Contrast flags into the a11y stream
- Print sweep: blank print output and nav/aside leaking into print flag as style pressure

## 0.8.0 — 2026-07-26

- New engine: Antigravity CLI (`antigravity`) — Google's Gemini CLI successor, run under a pty because agy silently emits nothing to pipes; --conversation resume, sandbox/permission mode mapping
- Soft-nav pulse: Chrome 151's soft-navigation entries observed during /flows — one line per SPA route transition with its worst interaction-contentful-paint (`soft-nav → /products · ICP 410ms`)
- Amp install strings track the @ampcode/cli rename

## 0.7.2 — 2026-07-26

- MCP surface grows to six tools: squint_flow_suggest (journeys drafted from live routes) and squint_receipt_verify (prove a receipt wasn't edited after sealing)
- squint init teaches by example: new projects start with a persistent check (did the app mount) and a two-line rules.md
- The sentinel watches .squint/rules.md — shrinking or deleting standing rules flags like watering down a check

## 0.7.1 — 2026-07-26

- Interval checks: `// squint-trigger: interval[:seconds]` runs a page assertion on wall-clock time between turns while `squint serve` is up — failures surface as a note to every attached terminal
- Fixture suites for the four previously untested adapters (opencode, amp, cursor, copilot); engines/configuration/CONTRIBUTING docs synced

## 0.7.0 — 2026-07-26

- The review lane: `/lane on` gives every ask a second read-only reviewer in fresh context — it sees the turn's diff, not the conversation, so it can't inherit the implementer's blind spots; at most 3 findings with file and line, on the cheap fix model when configured

## 0.6.1 — 2026-07-26

- Diff triptychs: big pulse changes render as a labeled before | after | heatmap composite inline in the terminal — the comparison is the message

## 0.6.0 — 2026-07-26

- New engine: `codex-app` drives Codex over the published app-server JSON-RPC protocol (threads, turns, streamed items) instead of scraping exec output — real deltas, tool items with commands, thread-id resume; `codex` (exec) stays the default

## 0.5.2 — 2026-07-26

- Verification receipts: every `squint ci` run seals its report (gates, audit, flows, versions, git head, screenshot SHA-256s) under a recomputable digest at `.squint/receipts/` — a green run becomes evidence
- Check triggers: `// squint-trigger: audit` keeps expensive assertions out of the per-turn probe; full audits still run everything
- `/flows suggest`: smoke flows drafted per declared route from the live page's own headings — goto/expect/shot, existing flows untouched

## 0.5.1 — 2026-07-26

- Keyboard journey in the a11y sweep: twelve real Tab keystrokes assert a visible focus indicator at every stop; invisible focus, traps, and untabbable pages all flag
- /goal: arm a standing machine-checked objective — it rides every ask and auto-fix presses to 6 attempts until squint's checks come back clean
- /distill: compress the design ledger into rules.md lines and proposed persistent checks — accumulated taste becomes standing enforcement

## 0.5.0 — 2026-07-26

- `squint mcp`: the gates as MCP tools over stdio (squint_check, squint_shot, squint_flows, squint_context) — any MCP-speaking agent invokes squint's verification natively, no adapter needed
- `squint ci`: one-shot verification for pipelines — gates + full page audit + flow replay, JSON report, non-zero exit on hard findings (runtime errors, phantoms, duplicate view-transition names, check failures)
- Claude adapter forwards subagent text (2.1.211+) so the loops see spawned work; APCA contrast joins the slop sweep (body text under Lc 60 = fog); review screenshots at deviceScaleFactor 2

## 0.4.8 — 2026-07-26

- Reward-hacking sentinel: deterministic gate-evasion detection per turn (deleted tests, added skips, @ts-ignore/eslint-disable, shrunken repo checks, locked-path touches) — reported to the human with an /undo pointer and an on-sentinel hook, never auto-fixed
- LoAF jank attribution: main-thread frames ≥50ms named by function and file, provoked by a scripted scroll; rides into /review with orders to fix the work, not remove the animation
- Element-attributed pulse diffs: the visual pulse now says WHAT changed — changed regions cluster and hit-test against the live page ("<nav.top-nav> (Shell): 1280×128 region changed")

## 0.4.7 — 2026-07-26

- Detachable sessions: `squint serve` owns the session on a unix socket; `squint attach` joins with the full TUI (`--plain` for line mode) — first client drives, later attaches observe, the oldest observer inherits on detach; crash-proof and ssh-friendly
- WebMCP tracking: the recorder shims both `document.modelContext` (the July spec relocation; Chrome 150 deprecates navigator) and the old location

## 0.4.6 — 2026-07-26

- Agent-authored persistent checks: engines persist page assertions as `.squint/checks/*.js` (taught on every ask); squint replays them against the live page after every turn and files failures as problems with orders to fix the page, not weaken the assertion
- WebMCP discovery: a pre-page-script shim records tools the page registers via `navigator.modelContext` (standing in for the API on pre-146 Chromes); declared tools ride into `/review`

## 0.4.5 — 2026-07-26

- React fiber probe: landmark elements resolve to their owning component chains (`h1 — Hero < App`) via `__reactFiber$` keys, no build-time tagger required; the component map rides into `/review`
- request_visual_approval: engines can write `.squint/approval-request.json` and end their turn instead of making a contested visual change alone; `/yes [note]` / `/no [note]` send the verdict back, screenshot renders inline, and the outcome lands in the design ledger

## 0.4.4 — 2026-07-26

- View-transitions correctness: duplicate view-transition-name values (the browser skips the whole transition) filed as problems with element pointers; declared transitions with no prefers-reduced-motion handling surfaced as advisories
- The Next.js channel: on next 16+ projects, squint speaks MCP to /_next/mcp after each turn and merges the framework's own build/runtime errors into the fix loop, ahead of log scraping

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
