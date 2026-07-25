# Wave 3 (July 2026 sweep)

Fifth research pass; everything here is new ground versus the shipped waves. Full sources at the end.

## Ranked candidates

1. **Framework runtime channel** — Next.js 16+ serves `/_next/mcp` on every dev server (build errors, runtime errors, routes, rendered segments) because "agents can't see the browser… make Next.js itself visible." Probe it on server start; poll after turns; merge into the fix loop as structured errors. Add RSC checks: hydration diff (JS-disabled HTML vs hydrated DOM; React #418/#423), client-boundary audit ("use client" high in the tree dragging server components clientward).
2. **Phantom-class check + Tailwind v4 rule-pack** — Tailwind has no official agent skill (open gap, discussion #19594). Agents hallucinate v3 classes in v4 projects (`bg-gradient-to-r`→`bg-linear-to-r`, `shadow-sm`→`shadow-xs`), create v3 configs, concatenate class strings the scanner never compiles. Deterministic catch-all: after each turn, diff every DOM class token against the compiled stylesheet's selectors — **present in DOM, absent from CSS = silently unstyled**, with element pointers. Plus static lint of diff hunks for v3-era patterns.
3. **Design memory: screenshot-anchored decision ledger** — the live complaint ("Figma Make overrides previous design decisions"); Taste apps inject a one-shot profile; DESIGN.md is a genre. Squint owns all the capture points: append `.squint/design-log.jsonl` entries `{ts, decision, screenshot_sha, pins, tokens_touched, verdict}` from accepted turns, rejected variants, pin annotations, slop overrides. Distill open decisions into the brief; violations cite the original entry with its thumbnail inline. Memory with receipts.
4. **Detachable daemon + observer attach** — Amp's multiplayer minus the cloud: `squint serve` owns the session over a unix socket; the TUI reconnects; second attach = observer (pins + queue, no approvals); remote via ssh -L. Also buys crash-proof sessions.
5. **Review lane** — a persistent cheap-model second session in fresh context that never edits: receives diffs + pulse frames + design-log, files findings as structured queue items the implementer consumes at boundaries. Concurrent, not post-hoc (Amp's agent-to-agent messaging is the shipped precedent).
6. **Agent-authored persistent checks** (the Pi move) — when the engine writes a one-off verification mid-session, persist it as `.squint/checks/*.js` in a capability-scoped sandbox (QuickJS/isolated-vm: `page.query`, `expect`, `finding()`), run every turn thereafter. One-off assertions become compounding, repo-versioned regression checks.
7. **React fiber probe** — read `__REACT_DEVTOOLS_GLOBAL_HOOK__` via CDP (react-grab/agent-react-devtools precedent): pins resolve to component+file+props without the build-time tagger; re-render-count findings during flow replay; Suspense map for the RSC audit.
8. **View Transitions correctness** — wrap `document.startViewTransition`, assert declared transitions ran during flows, flag duplicate `view-transition-name`, re-run under emulated `prefers-reduced-motion` and file a finding if things still animate. Nobody checks this category.
9. **WebMCP discovery** — Chrome 146+ pages register typed tools via `navigator.modelContext`; the probe can list them (flow verbs without selectors) and squint can register its own debug tools on the page.
10. **`request_visual_approval` tool** — agent-initiated, blocking approval: squint renders the proposal inline, enters pin-annotation mode, returns `{status, pins, text}` as the tool result (Snip's whiteboard mechanic, terminal-shaped).
11. **Vite 7/8 Rolldown rule-pack** — detect Vite major; lint config for deprecated esbuild-era options; pattern-match Rolldown CJS-interop warnings and inject the correct migration hint instead of letting engines flail.
12. **Context-economics doctor** — per-turn injected-token budget by source (brief, inventory, skills, rules, log distillate), skill usage frequency across transcripts, slow hooks, stale locks — with one-key trims.

## Competitive read (July 2026)

- **Claude Code**: in-app sandboxed browser on Desktop (pressure on squint's niche from above), /fork, fix-capable /doctor, agent rows with classifier headlines.
- **Codex**: inline Mermaid, interactive forms in tasks, multi-folder projects.
- **Amp**: the arc of the month — headless runners on your machines, agent-to-agent spawn/message/file-exchange, multiplayer shared terminals.
- **Google**: Gemini CLI being retired for closed-source Antigravity CLI — validates squint's multi-engine hedge; expect the gemini adapter to need migration.
- **Closest competitor shape**: Nimbalyst (open-source Electron visual workspace over Claude Code/Codex: worktrees, kanban, Chromium preview, multiplayer). Also Snip (render-annotate-approve), Dev Browser (sandboxed browser skill), react-grab, Herdr/Claude Squad multiplexers.
- **Position**: the GUI flank and cloud flank both advanced; nobody owns terminal-native deterministic runtime verification. Candidates 1–3 deepen the hardest-to-copy moat; 4 neutralizes multiplayer without the cloud.

## Sources

nextjs.org/blog/agentic-future · npmjs.com/package/next-devtools-mcp · github.com/tailwindlabs/tailwindcss/discussions/19594 · benjaminlooi.dev/blog/tailwindcss-v4-breaks-coding-ai-agents · fivecube.agency/blog/figma-make-vs-lovable-vs-v0 · designwithtaste.com · ampcode.com/news/{agents-anywhere,from-agent-to-agent} · akmatori.com/blog/herdr-agent-multiplexer · lucumr.pocoo.org/2026/1/31/pi · github.com/SawyerHood/dev-browser · react-grab.com · github.com/callstackincubator/agent-react-devtools · developer.mozilla.org View Transition API · zuplo.com/blog/what-is-webmcp · snipit.dev · vite.dev/guide/migration · infoq.com/news/2026/05/vite-v8-rust · code.claude.com/docs/en/whats-new · releasebot.io/updates/openai/codex · developers.googleblog.com Antigravity CLI · nimbalyst.com · sourcegraph.com/changelog
