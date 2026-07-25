# Feature mining: OSS Lovable alternatives + agent harnesses

Research snapshot (2026-07-26). What the high-starred builders and agents ship, distilled to mechanics a terminal harness can adopt. Full sources at the end.

## Ranked: what squint should build next

1. **Compile/lint auto-fix pre-loop** (dyad's killer feature): run `tsc --noEmit` + eslint after every turn, feed diagnostics back automatically up to N retries, toggleable. Cheapest verifier, biggest quality jump. → *shipped as `autoCheck`.*
2. **Shadow-git checkpoints with split restore** (Cline/Roo): snapshot into a shadow repo after every mutation; restore "files only" (keep conversation, compare implementations) vs "files + task". "The cost of a mistake drops to nearly zero" is what unlocks aggressive autonomy.
3. **Build-time element tagging** (Onlook): compiler plugin stamps JSX with source pointers at build time; selection resolves to file:line + component scope. Two-phase edits: instant DOM manipulation for feedback, then AST parse + write-back to persist. → *squint's tagger is this; Onlook validates the architecture.*
4. **Multi-pin annotation mode** (Lovable Jun 2026, v0 Jun 2026 — the convergence feature): drop numbered notes on several elements, each with text, compiled into ONE structured turn.
5. **Cross-route screenshot regression between turns** — open niche nobody ships: baseline all routes, pixel-diff after each turn (Playwright `maxDiffPixels` semantics), flag visual changes to routes the task didn't mention.
6. **Agent-readable log triage** (dyad Agent, Lovable Agent): browser console + network failures auto-injected, persistent Problems list batched per turn.
7. **Plan/Act split with per-mode models** (Cline, Lovable Plan Mode): plan = enforced read-only + stronger model; approve → act with cheaper model, history carried.
8. **Small-model context pre-pass** (dyad Smart Context, Plandex maps): haiku-class file-relevance selection + tree-sitter project map instead of full-repo context.
9. **Variants as branches with comparable previews** (Onlook self-toolcall, Plandex branches): worktrees + ports + side-by-side screenshot sheet, promote winner.
10. **Registry/design-system grounding** (v0/shadcn): registry JSON exposed to the agent (search/read/install) + an off-system-token lint filing violations as feedback.
11. **Inspectable prompt queue**: queue must be listable/editable; "next boundary" vs "interrupt now" are distinct verbs (Cursor's interrupt-after-tool-call bug is the cautionary tale).
12. **Cumulative diff sandbox** (Plandex): multi-turn changes accumulate in pending state; apply/reject per file.
13. **Context condensing as visible events** (Roo/OpenHands): threshold-triggered summarization logged with before/after token counts and cost — never silent.
14. **Keyword-triggered repo skills** (OpenHands microagents): `.squint/skills/*.md` with `triggers:` frontmatter injected only on match; summary first, full read on demand.
15. **Per-turn telemetry + finish notification** (v0 work details): time, files touched, cost per turn; terminal bell on completion; file locks (`bolt.diy`) as hard constraints.

## Per-tool mechanics worth remembering

- **dyad (21k★)**: tsc worker checks proposed edits with 2 auto-fix retries + Problems pane; Build/Ask/Agent modes; AI_RULES.md injected per prompt (adherence needs harness enforcement, not prompt hope); every accepted turn = git commit; chats-per-feature over one repo; fast-apply "Turbo Edits" second model materializes lazy edits.
- **bolt.diy (19.6k★)**: provider manager with live key validation; prompt library (per-model system prompts); file locking; one-click re-prompt of any command error.
- **Onlook (26k★)**: actions system — every visual edit serialized as a replayable action (undo/redo/collab); framework-agnostic tagging via swappable compiler plugins; agent uses itself as a tool to spawn branch variants.
- **OpenHands (82k★)**: whole session = append-only event stream; condensation is itself an audited event; ACP protocol drives Claude Code/Codex/Gemini — the harness/agent split is where the ecosystem landed.
- **Plandex (15.5k★)**: cumulative diff sandbox; version-controlled plans with branches and `rewind`; a single autonomy dial; model packs per role (planner/coder/applier).
- **Roo Code**: shadow-git checkpoints (aware of nested-repo hazards); orchestrator subtasks with strict context isolation (down: instructions only; up: summary only) — explicit "context poisoning" prevention.
- **Cline**: plan mode is *hard* read-only; separate model per mode with auto-switch; checkpoint after each tool use.
- **Lovable 2026**: preview toolbar (Select / Edit Text / Annotate / Comment); read-only research subagents in parallel; security scans as a turn; scheduled monitoring of the deployed app feeding errors back into chat.
- **v0 2026**: Design Mode with layers panel + measure overlay; annotations mode; agent shows its own testing screenshots; per-generation work details; in-form clarifying questions; sound on finish.
- **Bolt.new**: retired its own agent — Claude Agent default for all projects (Aug 2026). The durable layer is the harness; the agent is pluggable. squint's premise, confirmed by the market.

## Sources

github.com/{stackblitz-labs/bolt.diy, dyad-sh/dyad, onlook-dev/onlook, All-Hands-AI/OpenHands, plandex-ai/plandex} · dyad.sh/docs (+blog: ai-agent-mode-explained, ai-coding-rules) · docs.onlook.com/developers/architecture · docs.openhands.dev/overview/skills · roocodeinc.github.io/Roo-Code (checkpoints, boomerang-tasks, intelligent-context-condensing) · docs.cline.bot (plan-and-act, checkpoints) · docs.lovable.dev/changelog · v0.app/changelog · vercel.com/blog/ai-powered-prototyping-with-design-systems · ui.shadcn.com/docs/registry · sacra.com/c/bolt-new · solmaz.io/agentic-coding-tools-message-queueing
