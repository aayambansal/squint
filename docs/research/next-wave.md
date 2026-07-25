# Next wave (July 2026 sweep)

Fresh research after the first ranked list shipped completely. What's new in the ecosystem, the next ranked candidates, and the terminal-image protocol details for the headline feature.

## What shipped around us (Jun–Jul 2026)

- **Cursor 3.11**: Side Chats (`/btw` durable parallel side-conversations), transcript search over a local index, conversation-level hooks, per-request model Router, `/loop` until an outcome.
- **Claude Code**: background subagents (depth 3), worktree-isolated subagents, stacked skills, credential sandboxing. Inline terminal images: requested, analyzed (issue #54546 documents the Ink-repaint blocker), **still unshipped**.
- **Amp**: Orbs (remote per-thread machines, multiplayer, agents that set their own wake schedules).
- **Lovable**: file creations render as clickable visual preview tiles in chat — the GUI version of inline pulse rendering.
- **Design-token drift became a product category** (ds-bridge, Buoy, drift-guard): the four failure modes are token fabrication, within-session drift, between-session amnesia, silent breaking changes. All existing tools run at CI/PR time — too late; a per-turn harness is the right place.
- **Storybook 10.4**: agent auto-setup, affected-story focus, Storybook MCP.
- **Playwright 1.56+**: planner/generator/**healer** test agents; semantic locators over test-ids.
- **Evals**: ArtifactsBench/WebGen-Bench/VISTA/Asuka-Bench; the WebDevJudge caveat — LLM judges trail humans by ~14pts on working web apps and screenshots/rubrics don't close it; **pairwise comparison is where judges are reliable, 0–5 anchored scales align best (r=0.89)**. Self-scoring should blend deterministic signals + anchored judge, and prefer pairwise for variants.
- **Loudest practitioner complaint**: "every AI site looks identical" (Inter, purple gradient, card grid) — distinctiveness is an unsolved, *checkable* problem.

## Ranked candidates

1. **Inline screenshots in the terminal** — render the visual pulse (and review thumbnails) inside the transcript. No major agent CLI ships this; Lovable just validated the UX in GUI form. The blocker everyone hit is TUI repaint clobbering pixels; squint's `<Static>` region (written once into scrollback, never repainted) sidesteps it. Protocol notes below.
2. **Design-token drift guard, per turn** — deterministic: index token values (colors by distance, spacing exact), scan each turn's diff hunks for hardcoded values, suggest the nearest token, feed the fix loop. `--strict-tokens` gate.
3. **Frontend self-score** — deterministic axes squint already measures (a11y count, console errors, overflow, drift %) + a 0–5 anchored LLM rubric over the review screenshots; pairwise judging for variants (Design-Arena style) instead of absolute scores.
4. **Perf pulse** — CDP tracing on the probe navigation: LCP/CLS/TBT/transfer per route per turn, cross-turn deltas ("LCP +420ms this turn"), threshold breach → problem.
5. **Story-scoped verification** — map changed components → affected Storybook stories, pulse-diff at story granularity; generate stories for new components so they become verifiable.
6. **Recorded interaction flows** — record CDP input+network in the picker browser once ("checkout happy path"), replay headlessly each turn with mocked network, screenshot each step, heal broken selectors by accessible name.
7. **Figma frame grounding** — frame export as the reference image for an absolute pixel diff (spec-to-pixel, VISTA-style) + Code Connect mappings into the brief.
8. **Anti-slop detector** — deterministic in-page checks: Inter/Roboto/Arial/Space Grotesk stacks, purple gradient hero, symmetric card grids, emoji bullets, untouched shadcn defaults → "distinctiveness debt" findings.
9. **Harness-level hooks** — onTurnEnd / onPulseDiff / onScoreDrop / beforePromptSubmit, uniform across all 8 engines; squint's hooks fire on visual/quality events no other tool emits.
10. **`/btw` side threads** — read-only side conversation, promote conclusions into the queue.
11. **Transcript search → checkpoint jump** — FTS over saved transcripts, results thumbnailed by pulse screenshot, deep-link to /restore.
12. **Cross-vendor router** — classify asks (mechanical fix vs design pass) and route to cheap vs frontier engine tiers; auto-fix loops are the immediate win.
13. **Self-waking polish loop** — `squint loop --until "score>=4.2" --budget $15 --sandbox`: sandbox + budget + score already exist; the loop is the missing verb.
14. **Screen-reader narration pass** — linearize the a11y tree to "what a screen reader would say", judge coherence (alt text truthfulness, state announcements, reading order) — the reasoning layer above axe rules.
15. **Registry-aware component probe** — detect components.json, inject the real component inventory, lint imports against it, offer registry installs as fixes.

## Terminal image protocols (for #1)

Preference order and exact sequences:

- **Kitty APC** (kitty, Ghostty, WezTerm, Konsole): `ESC _ G f=100,a=T,c=<cols>,r=<rows> ; <base64 PNG> ESC \` — f=100 means PNG (dimensions read from the file), c/r scale into a cell rect preserving aspect. **Chunk base64 at 4096 bytes**: first chunk carries keys + `m=1`, middle `ESC _ G m=1;<chunk> ESC \`, last `m=0`. **Capability probe**: send `ESC _ G i=31,s=1,v=1,a=q,t=d,f=24;AAAA ESC \` then `ESC [ c`; support ⇒ `ESC _ G i=31;OK ESC \` arrives before the DA1 reply.
- **iTerm2 OSC 1337** (iTerm2, WezTerm): `ESC ] 1337 ; File=inline=1;size=<bytes>;width=<cols>;preserveAspectRatio=1 : <base64> BEL`. 1MB max per sequence.
- **Sixel**: legacy floor, palette-based, skip in v1.
- **Detection**: `TERM=xterm-kitty`/`KITTY_WINDOW_ID` → kitty; `TERM_PROGRAM=iTerm.app` → 1337; `TERM_PROGRAM=WezTerm` → prefer kitty; `TERM=xterm-ghostty` → kitty; then the a=q probe as ground truth. tmux needs passthrough wrapping (or kitty's Unicode-placeholder mode); v1 can simply disable under `TMUX`.
- **The repaint blocker and the out**: Ink-style renderers clobber injected pixels on repaint and don't know an image's row height. Render images **only inside `<Static>`** (written once, scrolls away) and advance the cursor by the reserved rows. `ink-picture` (npm) exists as a component with protocol detection + graceful text fallback if we'd rather depend than hand-roll.

## Sources

cursor.com/changelog · code.claude.com/docs/en/changelog · ampcode.com/news/agents-in-orbs · docs.lovable.dev/changelog · v0.app/changelog · ds-bridge.com · buoy.design · storybook.js.org/blog/storybook-10-4 · playwright.dev/docs/test-agents · developers.figma.com/docs/figma-mcp-server · sw.kovidgoyal.net/kitty/graphics-protocol · iterm2.com/documentation-images.html · github.com/endernoke/ink-picture · github.com/anthropics/claude-code/issues/54546 · arxiv (ArtifactsBench 2507.04952, VISTA 2605.26144, Asuka-Bench 2606.05920) · nerdy.dev/why-ai-sucks-at-front-end
