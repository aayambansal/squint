# The check catalog

Every deterministic check squint runs, what it catches, and where it surfaces. None
of these needs a judgment call — each finding names the element and carries the fix.
Taste stays with `/review`; everything here is measured.

## Gate-time (per turn)

| check | catches |
| --- | --- |
| typecheck + lint | type errors, lint violations (project scripts or tsc/eslint fallbacks) |
| version rule-packs | Tailwind v3 classes in v4 projects, retired Vite idioms — with the rename |
| token drift | hardcoded colors with a near-miss design token |
| the sentinel | gate evasion: deleted tests, added skips, suppressions, weakened checks/rules, locked-path touches |

## Dev-server sweep

Fresh build errors across the vite/esbuild/webpack/next/tsc vocabularies; on Next 16+,
the framework's own `/_next/mcp` structured errors merge in.

## Runtime probe (headless Chrome, per clean turn)

**Correctness**: uncaught exceptions, console errors, failed requests, blank pages.

**Accessibility**: missing lang/title/alt, unlabeled controls, unnamed buttons, heading
-order jumps, tiny tap targets, target spacing (WCAG 2.5.8), positive tabindex, keyboard journeys
(invisible focus, traps, untabbable pages), fake buttons (div-onclick), phantom IDREFs
(dangling aria-labelledby/popovertarget/…), form-error announcement readiness,
forced-colors invisibility, autofill grammar + WCAG 1.3.5, top-layer semantics
(hand-rolled modals), zoom-blocking viewport (WCAG 1.4.4).

**Distinctiveness (anti-slop)**: generic fonts, APCA-fog body text, emoji bullets,
untouched shadcn tokens, the Purple Problem (indigo hue, three equal cards, template
CTA copy), font-loading FOIT/FOUT, print leakage, dark patterns (preselected consent,
urgency theater, buried decline, confirmshaming).

**Modern-CSS disconnects**: phantom classes (DOM class, no CSS rule), view transitions
(duplicate names, missing reduced-motion), container queries (rules without containers
or vice versa), anchor positioning (orphaned targets), speculation rules (invalid /
failed prerender), WebMCP parity (deprecated surface, invalid schemas, form coverage).

**Security (served bytes)**: secrets in bundles/inline/localStorage (redacted),
client-side-only gates, mixed content (http on https), missing-CSP heuristic.

**Meta / SEO / social**: viewport zoom-blocking (WCAG 1.4.4), missing description,
missing og:image, invalid JSON-LD, production noindex leaks.

**Responsive images**: dimensionless (CLS), above-fold lazy-loading (LCP), large
rasters without srcset.

**Semantic gap**: the share of interactive elements with no accessible name.

**Component map**: React fiber ownership for pins and review pointers.

## Visual pulse

Element-attributed pixel diff with a before/after/heatmap triptych; LCP + transfer
deltas; long-frame (LoAF) jank attributed by function.

## Flow replay (`.squint/flows/*.flow`)

Declared journeys headlessly; per-transition soft-nav ICP (Chrome 151+, gate with
`budget icp <ms>`), the CLS shift ledger (per-element layout shift), the leak pulse
(detached DOM retained after the journey), and wall-clock duration.

## Persistent checks (`.squint/checks/*.js`)

Your own page assertions, replayed every turn — or on full audits / the daemon's clock
via the `// squint-trigger:` pragma.

## Where findings go

Gate/dev/runtime/a11y/flow/check problems collect into one list (`/problems`, `/fix`,
`/fix <source>`); distinctiveness and advisory findings ride `/review`; `/score` prices
the deterministic axes; `squint ci` seals them into a digest-verified receipt.
