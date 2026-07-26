# Wave 6 (July 27, 2026 sweep)

Eighth research pass; 19 searches. New ground only; sources at the end.

## Ranked candidates

1. **Form error announcement pulse** — on invalid submit, assert: new text landed in a
   PRE-EXISTING aria-live region (creating region+message together never announces —
   the classic agent bug), aria-invalid set, error linked via
   aria-describedby/errormessage, focus moved to the first invalid control. EAA ✓ shipped
   enforcement gives it regulatory teeth; no harness does interaction-level a11y.
2. **Secret sniff + client-side gate detector** — Escape.tech scanned 5,600 vibe-coded
   apps: 400+ exposed secrets. Regex+entropy over served bundles/storage/responses
   (sk-*, AKIA*, service-role JWTs, live Stripe keys); plus privileged content merely
   hidden by CSS/JS (display:none admin panels). Runtime vantage = served bytes. ✓ shipped
3. **Phantom IDREF audit** — dangling aria-labelledby/describedby/controls, label[for],
   popovertarget, commandfor, activedescendant — shadow-root aware (Chrome 151 ✓ shipped
   reference targets). Sibling of phantom classes; one DOM walk.
4. **Top-layer semantics audit** — div-modals that should be <dialog>, ::backdrop on
   non-modal popovers, showModal() without focus restore to the invoker, missing
   closedby. Interop 2026 makes the targets stable; axe/Lighthouse don't cover it. ✓ shipped
5. **Font-swap shift quantification** — double-load (webfonts CDP-blocked vs allowed),
   element-diff the layouts: "your H1 moves 14px when Inter loads; add size-adjust".
   Plus font-display/metric-fallback lint. ✓ shipped
6. **Autofill grammar validator** — full token grammar + ordering + WCAG 1.3.5
   (autocomplete=off on identity fields); Lighthouse left this gap open since 2020.
7. **CLS shift ledger per flow** — LayoutShiftAttribution top-shifters with selectors
   and rects; completes the attribution triad (pixels=diffs, time=LoAF, space=shifts). ✓ shipped
8. **WebMCP parity pack** — deprecated navigator.modelContext usage detection,
   form-coverage audit (forms with no declared tool), tool-schema JSON-Schema validity; ✓ shipped
   matches Lighthouse's agentic-browsing category inside the loop.

## Slop fingerprint, sharpened

"The Purple Problem" is named now: unchosen Inter, 250–280° hue band + gradient,
exactly-three rounded cards with top icons, "Get Started"/"Build faster"/"Ship
smarter" copy. Exact detectors for the shipped anti-slop sweep.

## Maintenance + platform

- **Chrome 151 stable (July 28)**: soft-navs stable (no flag); "invisible navigation"
  check possible (URL changed, no soft-nav entry = the transition failed the paint
  heuristic). Cross-root ARIA reference targets; aria-actions; form_submission
  speculation rules (flag on non-idempotent forms).
- **Chrome 153 (Sept)**: 2-WEEK release cycle — double the platform-watch cadence.
- **Claude Code 2.1.219+**: strictAllowlist can silently deny squint's daemon/webhook
  ports — document; DirectoryAdded hook; /fork spawns background sessions.
- **Codex**: rollout token budgets — size injections against remaining budget.
- **kitty 0.48**: TRANSIENT image hint (long daemon sessions stop bloating scrollback);
  OSC 66 text sizing (kitty+foot, Ghostty underway) — double-height verdict banners.
- **iTerm2 3.7**: OSC 9;4 progress bars first-class — emit during long audits.

## Papers

2607.04573 (deceptive patterns across age groups — dark-pattern rule fodder) ·
2607.01211 (agents game perf benchmarks — sentinel: "optimized" by removing work) ·
2607.00990 (SWE-Doctor: runtime diagnosis in the loop — the thesis, validated) ·
CHI 2026 semantic-accessibility gap (headline metric: DOM-interactive vs
AX-tree-interactive ratio).

## Sources

developer.chrome.com/blog/chrome-151-beta · new-in-devtools-150 ·
code.claude.com/docs/en/changelog · releasebot.io codex/antigravity/cursor ·
ampcode.com/chronicle · github.blog copilot changelogs · w3.org ARIA19/21 ·
act-rules.github.io/rules/73f2c2 · lighthouse #10450 · MDN LayoutShiftAttribution ·
developer.chrome.com framework-tools-font-fallback · oidaisdes.org dialog-closedby ·
web.dev interop-2026 · getautonoma.com vibe-coding-failures · spronta.com
state-of-webmcp · 925studios.co ai-slop-design-tells · dev.to indigo-500 ·
sw.kovidgoyal.net text-sizing-protocol · iterm2.com appcasts ·
arxiv.org/abs/{2607.04573,2607.01211,2607.00990,2606.29537} · dl.acm.org 3772363.3799364
