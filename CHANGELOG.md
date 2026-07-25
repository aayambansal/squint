# Changelog

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
