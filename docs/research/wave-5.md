# Wave 5 (very late July 2026 sweep)

Seventh research pass; 16 searches. New ground only; sources at the end.

## Ranked candidates

1. **Soft-nav pulse** — Chrome 151 (stable July 28) ships `soft-navigation` +
   `interaction-contentful-paint` performance entries with a `navigationId` tying
   LCP/CLS/INP to each SPA route transition. Nobody measures transitions
   deterministically; observe during /flows, budget per transition.
2. **Antigravity adapter** — the binary is `agy`; headless via `agy -p` with
   `--conversation <id>` resume, `--add-dir`, `-m`. Landmine: stdout is gated on
   isatty() — piped output is EMPTY with exit 0 (issue #76). The pty workaround
   (`script -q`) is itself a moat: naive wrappers silently get nothing.
3. **Approval webhook + delegation relay** — forward request_visual_approval to
   Slack/generic webhooks with the triptych attached and signed one-shot
   approve/reject URLs; route by action type. Demanded upstream (claude-code #26000),
   validated by Amp's shared-control orbs.
4. **Locale pulse** — pseudo-localize all text nodes (+40% expansion) and flip
   dir=rtl via injected TreeWalker, then reuse the element-attributed overflow
   detector. No harness checks i18n breakage; zero translation infra needed.
5. **Leak pulse** — HeapProfiler snapshot diff across repeated flow cycles: growth
   curve, detached DOM, duplicate strings, retaining paths (all proven agent-tractable
   by chrome-devtools-mcp 1.3–1.6).
6. **Deceptive-design check** — arXiv 2607.20690 unifies 19 UI principles (WCAG +
   dark-pattern taxonomies), releases the verification prompts; the deterministic
   subset (preselected consent, fake-urgency timers that reset on reload, buried
   decline buttons by size/contrast vs accept) is DOM-checkable.
7. **Forced-colors + print sweep** — two emulation modes nobody regression-tests;
   ~a day each on existing CDP infra; forced-colors pairs with the shipped APCA lane.
8. **Speculation-rules check** — verify prerender/prefetch rules actually fire (CDP
   Preload status + failure reasons, incl. 151's form_submission trigger) and that
   prerenders are side-effect-free.

## Hygiene (do first)

- **Amp renamed**: `@sourcegraph/amp` → `@ampcode/cli`; the compat alias is temporary.
- **Cursor headless**: `--force` now also implies workspace trust (fixes a real hang
  class); sessions save JSONL transcripts worth harvesting for receipts.
- **Claude Code 2.1.219**: `DirectoryAdded` hook (new attach point);
  `sandbox.network.strictAllowlist` may interplay with CDP probe ports. Built-in
  /verify + /code-review went manual — strengthens the always-on-verification pitch.
- **Copilot**: runs on GITHUB_TOKEN in Actions (squint ci recipe); credit session
  limits could mirror /goal's fix budget; Open Plugin Spec v1 manifests accepted.
- **opencode 1.18.4**: `--mini` mode; MCP server instructions now land in session
  context — write squint mcp's instructions field deliberately.

## Distribution pack (near-zero code, pure reach)

registry.modelcontextprotocol.io (reverse-DNS namespace, GitHub auth) · Claude Code
plugin marketplace (`.claude-plugin/marketplace.json`, submit to
anthropics/claude-plugins-official + claudemarketplaces.com) · Open Plugin Spec v1
manifest (Copilot CLI 1.0.74+) · Terminal Trove "Post a Tool" · Smithery (server +
skill listings).

## Papers

- 2607.20690 — RL-trained 4B VLM critic on 19 UI principles (F1 36→84); released
  data-generation recipe doubles as a calibration suite for squint's own detectors.
- 2607.06624 (AgentLens) — trajectory reviews attached to every run; suggests receipts
  gain a "why" section and `squint ci --compare` for nightly agent-version regression.
- 2607.05391 (LLM-as-a-Verifier) — continuous scores from scoring-token logits beat
  discrete judge integers; applicable to the review-lane rubric.

## Sources

github.com/google-antigravity/antigravity-cli · dev.to antigravity hands-on ·
github.com/rhishi99/agy-headless-bridge · code.claude.com/docs/en/changelog ·
ampcode.com/chronicle · npmjs.com/package/@sourcegraph/amp · releasebot.io/updates/cursor ·
github.blog copilot changelogs · opencode.ai/changelog · developer.chrome.com
chrome-151-beta / new-in-devtools-150 / soft-navigations · github.com/ChromeDevTools/
chrome-devtools-mcp/releases · debugbear.com speculation-rules · bramus SDA debugger ·
melanie-richards.com forced-colors · simplelocalize.io pseudo-localization ·
arxiv.org/abs/{2607.20690,2607.06624,2607.05391,2607.06341} · github.com/anthropics/
claude-code/issues/26000 · registry.modelcontextprotocol.io · code.claude.com plugin
marketplaces · terminaltrove.com/new · smithery.ai
