# How the best agent TUIs are built

Research snapshot (2026-07-26) from live source: gemini-cli (main), sst/opencode (dev), charmbracelet/crush, the claude-code-from-source teardown, aider/goose/plandex. What to copy, with paths.

## The three reference architectures

**opencode**: full client/server split — session state, tools, permissions live in a Bun server; the TUI (OpenTUI + Solid) is a thin reactive client over an SDK + SSE. Module shape worth copying: one context per concern (~15 providers), every dialog its own file, generic UI primitives separated from feature components, features as plugins with UI slots. **Keybinds**: a flat registry of `action → binding + description` powers keybinds, the ctrl+p command palette, slash commands, AND which-key hints from one source; leader key (ctrl+x) namespacing; user overrides in `tui.json`. **Themes**: JSON with `defs`, ~55 semantic tokens (12 diff, 14 markdown, 9 syntax), `{dark, light}` variants, `"none"` = terminal-transparent, and a generated `system` theme built from the real terminal background (OSC 11).

**gemini-cli** (the "Ink at scale" blueprint, ~470 files in `packages/cli/src/ui/`):
- State: **UIStateContext (one big read-only object) vs UIActionsContext (stable callbacks)** — action-only consumers never re-render. 60+ hooks, one per concern.
- Transcript: `<Static key={remountKey}>` for completed turns; the streaming turn renders below, **height-capped by MaxSizedBox** (`overflowDirection="top"`, "... generating more ...") so the live region never exceeds the viewport — THE flicker fix in normal buffer. `refreshStatic()` bumps the key on /clear, resize, theme change.
- Input: `shared/text-buffer.ts` (4,285 lines) — codepoint-aware editor with Unicode word jumps, undo/redo, large-paste collapse to `[Pasted Text: N lines]` chips, external-editor roundtrip, vim adapter. No npm package comes close; vendor it if ever needed (Apache-2.0).
- Markdown: hand-rolled line-based block parser → Ink boxes (Yoga wraps at real width); inline styles emit one chalk ANSI string per line (one Yoga node per line = the perf trick). Syntax: lowlight → HAST → nested `<Text>`; diff rendering with gutters + themed backgrounds; `diff@8`, `fzf`, `lowlight`, `@jrichman/ink` fork (alt-buffer, ScrollBox, mouse) are the notable deps.
- Message queue: `useMessageQueue` (~100 lines) — Enter mid-stream enqueues; auto-flush joined `\n\n` on idle.
- Themes: raw hljs-class themes + a semantic-token layer; components import a `theme` object with getters delegating to a singleton — switches don't re-plumb context, they `refreshStatic()`. OSC 11 background watch auto-switches dark/light only when the user is on a default theme.

**crush** (Bubble Tea reference): one renderer file **per tool type** (bash/file/fetch/diff/todos...) — bespoke compact renderings, never raw JSON. `streaming_markdown.go`: the **stable-prefix cache** — find the last blank line after which no markdown construct is open; cache the render of everything before it; only re-render the tail per token (O(n) streaming instead of O(n²)). Golden-file tests of the diff widget in dark AND light at multiple widths.

## Other gems

- **Claude Code** (teardown): packed-cell double buffer + damage-rect diff + synchronized-update escapes (60fps); `marked.lexer` + 500-entry LRU + plain-text fast path; `cli-highlight` behind Suspense; bracketed-paste keys flagged `isPasted` never match keybindings (security); keybinding contexts (16) with last-match-wins user overrides; esc = cancel in Chat context; shift+tab cycles the permission badge; ctrl+c twice to exit with a session summary.
- **aider**: git commit per AI change + `/undo` as an always-safe verb; `mdstream.py` prints stabilized lines above a live tail (same insight as crush).
- **plandex**: agent output staged in a version-controlled sandbox, `apply` to land — reviewable by default.

## The top-10 feel details (the checklist)

1. Transcript never flickers: Static scrollback + height-capped live region.
2. Esc interrupts instantly; ctrl+c is two-step with an exit summary.
3. Message queueing while the agent works, shown above the composer.
4. Permission/approval-mode badge cycled by shift+tab, always visible.
5. Semantic theme tokens + terminal-background adaptation (OSC 11).
6. Live status line: spinner + elapsed + rotating phrases + interrupt hint.
7. Paste safety: bracketed-paste never triggers bindings; large pastes collapse to chips.
8. One registry powers keybinds + palette + slash commands + help.
9. Per-tool-call renderers, collapsed by default, expandable.
10. Undo/rewind as a first-class verb; attention bell when unfocused; screen-reader layout.

## Sources

github.com/google-gemini/gemini-cli (packages/cli/src/ui) · github.com/sst/opencode (packages/tui/src) · opencode.ai/docs/{themes,keybinds} · github.com/charmbracelet/crush (internal/ui, streaming_markdown.go) · github.com/alejandrobalderas/claude-code-from-source (ch13/ch14) · github.com/Aider-AI/aider · deepwiki.com/block/goose · docs.plandex.ai/core-concepts/version-control
