# Making agents produce excellent frontend work

Research snapshot (2026-07-25): visual feedback loops, anti-slop design rules, quality gates, scaffolding, refinement prompting. Sources at the end.

## 1. Visual feedback loops

**Core doctrine (Anthropic):** agents stop when work "looks done" — hand them a check they can run. The canonical prompt: *"[screenshot] implement this design. take a screenshot of the result and compare it to the original. list differences and fix them."*

Verification tiers: (1) rules-based (lint/typecheck/tests — most robust; TypeScript is free feedback), (2) visual (screenshots for layout/hierarchy/responsiveness), (3) LLM-as-judge (taste only, never correctness). Escalation ladder for gating: in-prompt → goal condition per turn → deterministic Stop hook → **verification subagent in fresh context** ("the agent doing the work isn't the one grading it"). Require evidence, not assertions.

**Chrome DevTools MCP** (the standard "eyes"): `npx chrome-devtools-mcp@latest`. Interaction order: navigate → wait_for → **take_snapshot** (a11y-tree text; cheap, reliable for interaction) → act by uid; reserve `take_screenshot` for visual judgment. Also `list_console_messages`, `list_network_requests`, `resize_page`, `performance_*` traces, built-in `lighthouse_audit`. Save screenshots to files, read selectively — image payloads flood context. Give browser verification to **one** reviewer agent, not every worker (agents share a browser badly).

**Agentic design review (OneRedOak pattern)** — 7 phases, reviewing the diff in a live browser: interaction flows/states → responsiveness at **1440/768/375** (no horizontal scroll) → visual polish (alignment, spacing, hierarchy) → WCAG 2.1 AA (keyboard, focus, semantics, 4.5:1) → robustness (validation, overflow, loading/empty/error) → code health (reuse, tokens) → copy + zero console errors. Findings triaged [Blocker]/[High]/[Medium]/Nit, every visual issue ships with a screenshot, reviewer describes problems not solutions. Caveat: a reviewer prompted to find gaps will always report some — restrict to findings affecting correctness or stated requirements.

**Reference loop to implement:**

```
1. Dev server in background; stdout/stderr → log file
2. STATIC GATE (seconds): tsc --noEmit && eslint . --max-warnings 0
3. RUNTIME GATE: navigate → wait_for → console messages (fail on error)
   → dev-server log (compile/HMR errors) → network (fail on 4xx/5xx)
4. VISUAL PASS: screenshot → critique vs brief → fix → re-screenshot (cap 2–3 iterations, then escalate)
5. RESPONSIVE PASS: 375/768/1440 screenshots + scrollWidth > innerWidth check
6. A11Y/PERF GATE (milestones, not every edit): axe CLI + lighthouse
7. FRESH-CONTEXT REVIEW: design-review pass over the final diff in the live browser
```

## 2. Anti-"AI slop" design

**Why slop happens:** models converge toward on-distribution outputs. Fix = name the failure mode in the prompt (Anthropic's `DISTILLED_AESTHETICS_PROMPT`): avoid generic fonts (Inter, Roboto, Arial, system); commit to a cohesive aesthetic via CSS variables; "dominant colors with sharp accents outperform timid evenly-distributed palettes"; one orchestrated page-load with staggered reveals beats scattered micro-interactions; atmosphere/depth over flat solid backgrounds; avoid clichés (purple gradients on white); and the meta-rule — models also converge on the *escape hatches* (everyone picks Space Grotesk), so vary across generations.

**Typography specifics:** pair on contrast axes (display+mono, serif+geometric sans); weight extremes 100/200 vs 800/900 rather than 400 vs 600; display size jumps 3×+, not 1.5×; ≤2–3 families; state the choice before coding.

**First-generation tells** (match-and-refuse list): Inter everywhere; VibeCode purple + purple-gradient-on-white; centered hero with badge above H1; **3–4px colored left-border strips on cards** (most reliable tell); identical icon-topped card grids; numbered 1-2-3 step sections; stat banner rows; emoji as icon system; all-caps tracked section labels; unmodified shadcn defaults; glassmorphism; medium-grey body text on permanent dark mode.

**Second-generation tells** (what models do after being told to avoid the above): cream/sand/beige body background as reflex "warmth" (the saturated AI default of 2026); tiny uppercase eyebrow above every section; 01/02/03 section markers; gradient text; nested cards. **Category-reflex check at two altitudes**: if theme+palette is guessable from the product category alone → rework; if guessable from category *plus* the obvious anti-reference → that's the trap one tier deeper, rework again. Acceptance test: *"If someone could look at this and say 'AI made that' without doubt, it's failed."*

**Craft rules (promptable, several machine-checkable):**
- Body contrast ≥ 4.5:1 (placeholders too); light-gray-for-elegance is the #1 readability killer
- Body line length 65–75ch; type-scale ratio ≥ 1.25; display letter-spacing ≥ −0.04em; `text-wrap: balance` on headings, `pretty` on prose; no all-caps body copy
- OKLCH/HSL tokens; pick a **color strategy before colors**: Restrained (neutrals + one accent ≤10%) / Committed (one saturated color, 30–60% of surface) / Full palette (3–4 named roles) / Drenched (the surface is the color)
- Motion: ease-out only, no bounce; `prefers-reduced-motion` alternative mandatory; **never gate content visibility behind scroll-reveal** (headless renderers ship blank sections)
- Semantic z-index scale, never 9999; `repeat(auto-fit, minmax(280px, 1fr))` grids
- Copy: no buzzwords; button labels verb+object ("Save changes", not "OK")

**Design-system-first prompting:** three-tier tokens (primitive → semantic → component) — "when AI sees `--button-primary-bg` it understands purpose; when it sees `#EC681E` it has to guess." Bridge into Tailwind via CSS variables; ban arbitrary values (`p-[13px]`) via ESLint. Per-request template: Context (tokens + reference) → Task → Constraints ("semantic tokens only") → Output. "AI doesn't need rationale. It needs clear constraints and working examples." Keep guidance at the right altitude: not hex values, not "make it modern".

**DESIGN.md ecosystem:** organize reusable style guides by **aesthetic family** (Editorial Minimalism, Terminal-Core, Warm Editorial, Data-Dense Pro, Cinematic Dark, Playful Color, Neon Brutalist) + remix recipes ("Linear's typography + terracotta accents") as cheap non-generic direction.

## 3. Quality gates (fastest-first)

| Gate | Command | Fail condition |
|---|---|---|
| Types | `npx tsc --noEmit` | exit ≠ 0 |
| Lint | `npx eslint . --max-warnings 0` | exit ≠ 0 |
| Tests | `npx vitest run` | exit ≠ 0 |
| Build | `vite build` / `next build` | exit ≠ 0 |
| Dev-server | tail the server log | compile/HMR error lines |
| Console | DevTools MCP `list_console_messages` | any error-level message |
| Network | `list_network_requests` | 4xx/5xx on first load |
| A11y | `npx @axe-core/cli <url> --tags wcag2a,wcag2aa,wcag21aa --exit` | violations > 0 |
| Lighthouse | `npx lighthouse <url> --output=json --quiet --chrome-flags="--headless"` | threshold miss |
| Responsive | resize 375/768/1440 + `document.documentElement.scrollWidth > window.innerWidth` | overflow; touch targets < 44px |
| Visual regression | Playwright `toHaveScreenshot()` with committed baselines | diff > threshold |

Inner loop = tsc/eslint/console only (seconds). Slow gates (lighthouse, axe, visual regression) at milestone boundaries. Wiring strictness ladder: package scripts → post-edit hooks → pre-commit → stop-gate → fresh-context adversarial review.

Scoring template (impeccable): five dimensions (A11y, Perf, Theming, Responsive, **Anti-Patterns**) 0–4 each, /20 total; anti-patterns dimension: "0 = AI slop gallery (5+ tells) … 4 = no AI tells"; report opens with a pass/fail "Does this look AI-generated?"

## 4. Scaffolding (2025/2026)

- **Vite** default for generated apps (instant startup, fast HMR, small failure surface — no RSC boundaries/hydration for the agent to trip over; `vite build` is a fast gate). **Next.js** only when the brief needs SSR/SEO/server actions. Lovable generates Vite; v0 generates Next.
- **Tailwind v4**: CSS-first — `npm i tailwindcss @tailwindcss/vite`, then `@import "tailwindcss"; @theme { --font-display: …; --color-brand: oklch(…); }` — `@theme` makes tokens first-class utilities; the natural home for the anti-slop token system.
- **shadcn/ui**: `npx shadcn@latest init` + `add <components>`; components land as plain readable TS (AI-comprehensible); **immediately override default tokens** or ship the "shadcn defaults leaking through" tell.
- **Registry pattern**: run a private shadcn registry so the agent installs real approved components (`npx shadcn@latest add @yourco/data-table`) instead of hallucinating — turns "follow the design system" from prompt hope into supply chain.

## 5. Refinement prompting patterns

- **Effort modifiers**: "Don't hold back. Give it your all." + explicitly request many features/interactions + "thoughtful details like hover states, transitions, micro-interactions." Combine with aesthetics rules so ambition has direction.
- **Commit-then-code**: force explicit design commitment (tone, palette strategy, fonts) stated before any code — prevents mid-generation drift to the median.
- **Self-critique screenshot loop**: render → screenshot → "list differences and fix them" → repeat; 2–3 focused iterations beat ten unfocused; after two failed corrections, clear context and re-prompt with what was learned.
- **Multi-variant then pick-best**: 3–5 parallel variants, one committed aesthetic direction each; screenshot all; pick with eyes. Directed variants beat "try again": "push it darker and more premium; tighten rhythm to 8px; weight contrast 300 vs 800."
- **Layered context**: skill/system prompt (anti-slop guardrails) → short design section in project memory (fonts, token names, forbidden patterns — cut anything that wouldn't cause mistakes if removed) → full DESIGN.md loaded for design work → real visual references (references beat adjectives).
- **Named scoped passes** instead of vague "make it beautiful": critique (scored) → typeset / layout / colorize / animate → bolder / quieter → harden (errors, edge cases, i18n) → polish; re-audit after fixes so the score visibly improves. One falsifiable objective per pass.
- **Writer/reviewer separation**: fresh-context review of the UI diff; interview→spec→clean implementation for larger features.

## Sources

- https://code.claude.com/docs/en/best-practices · https://claude.com/blog/building-agents-with-the-claude-agent-sdk
- https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics · https://claude.com/blog/improving-frontend-design-through-skills
- https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
- https://developer.chrome.com/blog/chrome-devtools-mcp · https://github.com/ChromeDevTools/chrome-devtools-mcp · https://addyosmani.com/blog/devtools-mcp/
- https://github.com/OneRedOak/claude-code-workflows
- https://www.huuhka.net/browser-verification-for-coding-agents-chrome-devtools-mcp-vs-agent-browser/
- https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
- https://www.braingrid.ai/blog/design-system-optimized-for-ai-coding · https://github.com/rohitg00/awesome-claude-design
- https://superdesign.dev/blog/claude-code-ui-design · https://www.aihero.dev/essential-ai-coding-feedback-loops-for-type-script-projects
- https://ui.shadcn.com/docs/registry · https://ui.shadcn.com/docs/tailwind-v4 · https://www.npmjs.com/package/@axe-core/cli
