# Changelog

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
