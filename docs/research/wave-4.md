# Wave 4 (late July 2026 sweep)

Sixth research pass. Eighteen searches across CLI changelogs, DevTools releases,
arXiv, and the competitive field. New ground only; sources at the end.

## Ranked candidates

1. **Diff triptychs inline** — pulse screenshots already render in-terminal; the upgrade
   is before/after/diff-heatmap side by side at deviceScaleFactor 2 (Playwright MCP's
   `scale=device` catches sub-pixel slop 1x misses). ✓ shipped
2. **`squint mcp`** — serve the gates (pulse, flows, a11y journey, token doctor) as MCP
   tools so any MCP-speaking agent invokes squint without an adapter. chrome-devtools-mcp
   going stable with custom JS tools proves the channel. ✓ shipped
3. **Reward-hacking sentinel** — deterministic detection of gate evasion: tests
   deleted/skipped, `.squint/checks/*` weakened, thresholds loosened, `@ts-ignore`
   added, baselines replaced. Backed by the Verification Horizon paper (arXiv
   2606.26300): behavior monitoring beats output verification alone. ✓ shipped
4. **LoAF jank-attribution gate** — Long Animation Frames hit W3C FPWD with scripted
   attribution; inject the observer in the probe, scripted-scroll, attribute ≥50ms
   frames to files the engine touched. Nobody ships this inside an agent loop. ✓ shipped
5. **Element-attributed visual diffs** — turn the pulse's percentage into per-element
   sentences: cluster diff regions, hit-test against the DOM via CDP ("header nav:
   +18px height; .cta: background #2563eb → #94a3b8"). ✓ shipped
6. **`/goal` compilation** — Claude Code formalized goal loops with evaluator-checked
   stop conditions; squint's gates are the machine-checkable condition. Compile "all
   gates green" into the ask for Claude; emulate with the outer loop elsewhere. ✓ shipped (/goal)
7. **Codex app-server adapter** — OpenAI published the JSON-RPC 2.0 spec (stdio JSONL +
   WebSocket): structured turns, streaming diffs, server-initiated approval requests
   (maps onto request_visual_approval), token budgets. Rewrite the codex adapter on it. ✓ shipped (codex-app)
8. **Ledger distillation → proposed checks** — idle job compressing ledger + gate
   history into rules and *proposed* persistent checks ("4 gradient buttons rejected —
   generate a check?"). DesignPref (arXiv 2511.20513) proves per-project taste beats
   aggregate judges even from tiny data. ✓ shipped (/distill)
9. **Keyboard-journey gate** — replay each .flow keyboard-only (Tab/Enter/Escape),
   assert focus visibility per step and focus restoration after modals; a11y-tree diff
   across route changes. Static sweeps catch 20–40%; behavior catches the rest. ✓ shipped (keyboard journey)
10. **Check triggers** — Amp went event-driven (agents wake on CI failures, issues);
    `.squint/checks/*.js` gain a `trigger` field (turn | fs-change | interval). ✓ shipped (audit pragma)
11. **Flow planner/healer** — Playwright's official planner/generator/healer agents:
    `squint flow suggest` drafts flows by exploring the app; `squint flow heal` repairs
    a selector-broken flow instead of red-failing. ARIA-snapshot assertions resist DOM churn. ✓ shipped (/flows suggest)
12. **Verification receipts** — every green gate stores a signed artifact (commands,
    versions, screenshot hashes, timestamps); a squint run becomes auditable evidence.
    The market scorecard names "source receipts" as the universal gap. ✓ shipped

## Housekeeping-grade but urgent

- **WebMCP moved to `document.modelContext`** (Chrome 150 deprecates navigator) — ✓ shipped.
- **Claude adapter**: enable `--forward-subagent-text` (2.1.211+) so subagent output is
  visible to the loops; watch `/fork` background sessions. ✓ shipped
- **APCA contrast** graduated in DevTools 149 — add alongside WCAG ratios in the slop sweep. ✓ shipped
- **aider is dormant** (no release since Aug 2025) — deprioritize the adapter.
- **Copilot CLI 1.0.73** sandbox splash; **Cursor 3.11** side chats + Run-on picker;
  **Antigravity CLI 2.3.0** (Go rewrite) queued messages + markdown subagents — adapter watch.
- **Chrome 146** can enable remote debugging from settings (no flag) — a future
  attach-to-user's-Chrome mode. **Chrome 148** throttling presets from CrUX field data.

## Competitive read (July 2026)

- **GitHub closed the agentic browser loop in VS Code** (GA July 1): Copilot agents
  click and verify UI in the integrated browser. The event of the month. squint's
  counter: deterministic, scriptable, CI-able gates the agent can't skip — sharpen
  with a headless one-shot `squint ci` (gates → exit code + JSON report). ✓ shipped
- **"y"**: malleable local desktop wrapper whose UI the agent itself modifies; the
  market checklist it ships (worktrees, inspectable memory, rollback, receipts, cost
  visibility) reads as a scorecard squint already mostly clears.
- **Sourcegraph Agentic Batch Changes**: harness-outside/agent-inside validated at
  enterprise scale; live inner-agent streaming is table stakes.
- **The loop-spec paper** (arXiv 2607.00038): 50 production loops analyzed — strong
  verification, weak triggering and durable memory across the corpus. squint's checks
  + ledger sit exactly in the named gap.

## Sources

gradually.ai claude-code/codex-cli/opencode changelogs · code.claude.com/docs/en/goal ·
codex.danielvaughan.com app-server guide · ampcode.com/news/{schedule,event-driven-orbs} ·
github.com/github/copilot-cli/releases · cursor.com/changelog · antigravity.google/changelog ·
stork.ai OpenTUI · akmatori.com terminal-graphics-protocols · arewesixelyet.com ·
w3.org LoAF FPWD · developer.chrome.com/blog/new-in-devtools-{148,149} ·
ds-bridge.com · github.com/ahoybuoy/buoy · usefragments.com · superdesign.dev drift study ·
disabilityworld.org AT tooling · qtrl.ai visual-regression-2026 · playwright.dev/docs/test-agents ·
spronta.com state-of-webmcp-july-2026 · pptr.dev/CHANGELOG · debugbear.com react-19-2-tracks ·
arxiv.org/abs/{2607.00038,2606.26300,2511.20513} · arxiv.org/pdf/{2506.11442,2606.05697} ·
techtimes.com vs-code-agentic-loop · developersdigest.tech local-workspaces ·
sourcegraph.com/changelog · github.com/{2389-research/agentjj,maxdmyers/recall}
