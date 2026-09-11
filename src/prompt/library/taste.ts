import type { BundledSkill } from './types.js'

/**
 * The taste layer: the craft rules that separate a designed product from
 * a competent scaffold. The brief states the standards; this says how to
 * meet them. Rides along on design-shaped asks for every platform.
 */
export const designTaste: BundledSkill = {
  name: 'design-taste',
  summary: 'craft rules — hierarchy, type, color, space, states, motion, copy, forms',
  triggers: [
    'design',
    'redesign',
    'ui',
    'ux',
    'layout',
    'typography',
    'font',
    'fonts',
    'color',
    'colour',
    'palette',
    'spacing',
    'hero',
    'landing',
    'dashboard',
    'polish',
    'look and feel',
    'style',
    'styling',
    'theme',
    'motion',
    'animation',
    'animate',
    'empty state',
    'onboarding',
    'form',
    'forms',
    'screen',
    'page',
    'component',
    'button',
    'card',
    'modal',
    'dialog',
    'navigation',
    'nav',
    'tab bar',
    'tabs',
    'menu',
    'toolbar',
    'sidebar',
    'header',
    'footer',
    'section',
    'responsive',
    'mobile',
    'dark mode',
    'beautiful',
    'pretty',
    'premium',
    'visual',
    'brand',
    'branding',
    'logo',
    'icon',
    'icons',
    'illustration',
    'gradient',
    'shadow',
    'radius',
    'padding',
    'margin',
    'alignment',
    'hierarchy',
    'contrast',
    'accessibility',
    'a11y',
    'hover',
    'transition',
    'skeleton',
    'loading state',
    'error state',
    'toast',
    'banner',
    'tooltip',
    'dropdown',
    'checkbox',
    'toggle',
    'slider',
    'avatar',
    'badge',
    'chart',
    'widget',
    'pricing',
    'signup',
    'sign up',
    'login page',
    'settings page',
    'profile page',
    'cta',
    'call to action',
    'microcopy',
    'wording',
    'headline',
    'tagline',
    'placeholder',
  ],
  body: `# Design taste

Method
- Look before touching: read the existing screens (component code, a screenshot) and name what already works. Extend the system; restart it only when asked.
- State the direction in one sentence, then the three moves that express it. If a competent stranger could guess the direction from the product category alone, sharpen it.
- One falsifiable objective per pass — critique → typeset → layout → colorize → animate → harden → polish. Re-screenshot after each pass; the before/after must show that objective landed.

Hierarchy
- One primary action per view. Everything else is secondary (tonal/outlined) or tertiary (text).
- Three levels of emphasis, maximum. Separate levels with two variables at once (size + weight, weight + color), never four.
- Size is the weakest tool; proximity and alignment are the strongest. Gaps between groups are at least 2× the gaps inside them.
- The squint test: blur the screenshot mentally — the structure must survive without reading a word.

Typography
- A fixed modular scale (ratio 1.2–1.333, 6–8 steps). Every size on the page comes from it.
- Line-height 1.05–1.2 for display, 1.45–1.65 for body. Bigger text gets tighter leading and tracking (−0.01em at 24px → −0.04em at 72px).
- Measure 45–75 characters. Body ≥ 16px on mobile; 13–14px only inside dense professional tools.
- Tabular figures wherever numbers align (tables, prices, timers). Never faux bold or italic. \`text-wrap: balance\` on headings, \`pretty\` on prose.
- Weight contrast beats size contrast: 400 body against 700+ headings, or 300 against 800 for drama.

Color
- Choose the strategy first (restrained / committed / small palette / drenched), then derive tokens in OKLCH so steps are perceptually even.
- Neutrals carry a hint of the accent hue; pure gray reads dead next to color.
- Roles, not values: bg, surface, surface-raised, border, text, text-muted, accent, on-accent, success, warning, danger. Components reference roles only.
- Body contrast ≥ 4.5:1 (aim for APCA Lc 75); large text and UI ≥ 3:1; placeholders count. Meaning is never carried by color alone — pair it with an icon, text, or position.
- Dark mode is a second palette, not inverted values: lighter surfaces mean "closer", accents desaturate 10–20%, no pure #000 under pure #fff.

Space and layout
- One spacing scale (4/8-based) for padding and gaps alike; a component's inner padding is constant across its instances.
- Intrinsic layouts first: \`repeat(auto-fit, minmax())\`, \`flex-wrap\`, container queries. No fixed heights on anything that holds text.
- Reading content caps at 65–75ch; full-bleed is for imagery and data.
- Separate with space and hairlines before boxes. Cards inside cards, or border + shadow + background on one element: pick one.
- Density is a product decision — marketing breathes, tools pack. Never mix altitudes on one screen.

States and components
- Every interactive element: default, hover, focus-visible (2px ring, offset, in the accent), active, disabled, loading. A missing state reads as broken.
- Touch targets ≥ 44×44 with ≥ 8px between them; pointer targets ≥ 24px.
- Loading: skeletons shaped like the final layout for content; spinners only for actions under ~1s; nothing shifts when data lands — reserve the space.
- Empty state = what this is + why it's empty + one primary action. Error state = what happened + what to do next + the user's input preserved.
- Destructive actions name the object and the count ("Delete 3 files"), confirm, and offer undo where possible.

Motion
- Motion explains: where something came from, what changed, what is still working. Decorative motion is debt.
- 120–180ms micro, 200–300ms transitions, 300–450ms page-level. Ease-out entering, ease-in leaving; no bounce in productivity UI.
- Animate only transform and opacity; stagger 30–60ms; one orchestrated entrance per page, then stillness.
- \`prefers-reduced-motion\`: cross-fade or nothing. Never hide content until a scroll observer fires.

Copy
- Buttons are verb + object in sentence case ("Save changes", "Create project") — never "Submit", "OK", "Click here".
- Headlines say the specific thing, not the superlative. Errors say what to do. Numbers carry units.
- Placeholders are hints, not labels; labels stay visible.

Forms
- Single column, labels above fields, one idea per step. Group related fields; mark optional fields rather than required ones.
- Validate on blur, re-validate on change, summarize on submit; the message sits beside the field and the field keeps its value.
- Correct \`type\`, \`inputmode\`, \`autocomplete\`; sensible defaults; never clear a form on error.

Accessibility beyond the deterministic checks
- Landmarks (header / nav / main / footer), one h1, headings in order. ARIA only where HTML cannot express it.
- Icon-only controls get names; async updates announce through live regions; dialogs trap and restore focus; Escape closes.
- A keyboard-only walkthrough before calling anything done; 200% zoom must not break the layout.`,
  reviewChecklist: `- Rank findings Blocker / High / Medium / Nit. Blocker: broken, unreadable, or misleading. High: hierarchy or contrast wrong. Medium: inconsistency. Nit: taste.
- Each finding: where (element, viewport), what is wrong, why it matters, the fix. Describe the problem before prescribing the solution.
- The two-altitude test: could the look be guessed from the product category? From the category plus the obvious anti-reference? Yes to either means rework the direction, not the details.`,
}
