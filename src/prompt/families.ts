import { DEFAULT_BRIEF } from './brief.js'

/**
 * Aesthetic-family starters for .squint/brief.md — committed design
 * directions a project can adopt so every session holds the same look.
 * Families follow the research finding that organizing by aesthetic
 * (not industry) plus remixing is the cheapest route to non-generic
 * work. Each generated brief is self-contained: direction + the full
 * core standards.
 */
export interface Family {
  id: string
  name: string
  summary: string
  direction: string
}

export const FAMILIES: Family[] = [
  {
    id: 'editorial-minimal',
    name: 'Editorial Minimalism',
    summary: 'Linear/Stripe lineage — restraint, typography does the work',
    direction: `## Direction: Editorial Minimalism

Quiet surfaces, decisive typography, one accent used sparingly. The design should feel edited, not decorated.

- Type: a characterful grotesque or neo-grotesque for display (never Inter/Roboto), same family or a close neutral sans for body. Weight extremes carry hierarchy (300 vs 700+), not size alone.
- Color: near-white paper, near-black ink, one accent on less than 10% of the surface. No gradients.
- Space: generous whitespace on an 8px rhythm; wide margins; content max-width around 68ch.
- Motion: almost none — 150ms fades and position shifts only where they explain state.
- Avoid: cards for everything (prefer rules and spacing to separate content), icon grids, decorative illustration.`,
  },
  {
    id: 'terminal',
    name: 'Terminal-Core',
    summary: 'Monospace, dark, dense — software that looks like software',
    direction: `## Direction: Terminal-Core

Unapologetically technical: monospace-forward, dark, information-dense, zero chrome.

- Type: a great monospace (JetBrains Mono, Berkeley Mono lineage) for UI and data; optionally one compact sans for long prose.
- Color: true dark background (not gray soup), phosphor-inspired accent (green/amber/cyan — pick ONE), semantic red/yellow only for status. Body text stays high-contrast.
- Space: tight but rhythmic — 4px grid, table-like alignment, visible structure (rules, column guides).
- Motion: instant. At most a cursor blink or a 100ms state flash.
- Avoid: rounded-corner softness, shadows, any gradient, lowercase-only affectation that hurts scanning.`,
  },
  {
    id: 'warm-editorial',
    name: 'Warm Editorial',
    summary: 'Serif display, humane warmth — carried by type and accents, never a beige page',
    direction: `## Direction: Warm Editorial

Bookish confidence: a serif with real character doing the talking, warmth carried in accents and imagery.

- Type: expressive serif display (Fraunces/Newsreader lineage) paired with a geometric sans for UI. Big size jumps (3x+) between display and body.
- Color: paper stays crisp near-white — warmth comes from a terracotta/ochre/oxblood accent and ink that leans warm-black. Never a cream/beige page background.
- Space: editorial grid with asymmetry; pull-quotes and drop caps welcome where content supports them.
- Motion: soft 200ms ease-out reveals on load, nothing on scroll.
- Avoid: script fonts, sepia-toned everything, decorative dividers.`,
  },
  {
    id: 'data-dense',
    name: 'Data-Dense Pro',
    summary: 'Dashboards and tools — density as a feature, hierarchy through alignment',
    direction: `## Direction: Data-Dense Pro

Built for people who live in the product eight hours a day: density, alignment, and speed over air.

- Type: one compact sans with strong numerals (tabular figures mandatory for data); 13–14px body is correct here.
- Color: neutral surface ladder (2–3 steps), one brand accent for primary actions, strict semantic palette for status. Charts get a deliberate categorical ramp, not rainbow defaults.
- Space: 4px grid, table-first layouts, column alignment across widgets; every panel earns its border.
- Motion: none on data; 120ms on overlays only.
- Avoid: hero sections, marketing spacing, cards-inside-cards, centered text.`,
  },
  {
    id: 'cinematic-dark',
    name: 'Cinematic Dark',
    summary: 'Dramatic dark surfaces, controlled glow, product as protagonist',
    direction: `## Direction: Cinematic Dark

Dark with intent — depth from lighting logic, not gray layers. The product shot is the hero.

- Type: a wide/display sans with presence for headlines, tight tracking at size; clean sans body at high contrast (no mid-gray text on black).
- Color: near-black stage, one luminous accent used like stage lighting (hover glows, focus rings, key CTAs). At most one gradient, in the accent hue, and only where light would fall.
- Space: generous vertical rhythm; content emerges in layers.
- Motion: one orchestrated entrance with staggered reveals (200–250ms, ease-out), then calm.
- Avoid: purple-on-black defaults, glassmorphism panels, glow on everything, starfields.`,
  },
  {
    id: 'playful',
    name: 'Playful Color',
    summary: 'Saturated, confident color — joy with a grid underneath',
    direction: `## Direction: Playful Color

Color does the branding: saturated fields, chunky type, real personality — held together by a strict grid.

- Type: a rounded or geometric display face with real weight (800+) for headlines; simple sans body.
- Color: commit — the surface IS the color (drenched sections in 2–3 saturated hues that share a tonal family). Text stays black or white, always AA.
- Space: big blocks, hard edges between color fields, 8px rhythm inside them.
- Motion: springy but short (200ms, one bounce maximum); hover states that visibly react.
- Avoid: pastel timidity, rainbow spread (pick a family), emoji as design elements.`,
  },
  {
    id: 'brutalist',
    name: 'Neo-Brutalist',
    summary: 'Raw structure, stark type, hard edges — the grid is the aesthetic',
    direction: `## Direction: Neo-Brutalist

Structure exposed: visible borders, stark type, unapologetic contrast. Honest, loud, precise.

- Type: oversized display type (grotesque or mono), often uppercase, tracking tightened; body stays small and functional.
- Color: black on white (or one inverted section), plus a single shock accent. Solid fills only.
- Space: hard 2–4px borders, no shadows, no rounding (or one deliberate radius used everywhere); layouts that show their grid.
- Motion: abrupt on purpose — instant state changes, maybe one marquee if the content earns it.
- Avoid: soft shadows sneaking in, gradient anything, politeness.`,
  },
]

export function getFamily(id: string): Family | undefined {
  return FAMILIES.find((f) => f.id === id)
}

/** The core standards appended to every generated brief (direction-agnostic). */
function coreStandards(): string {
  // Everything after the direction guidance in the default brief applies
  // universally: tokens, banned tells, craft details, engineering.
  const marker = 'Tokens are the system:'
  const index = DEFAULT_BRIEF.indexOf(marker)
  return DEFAULT_BRIEF.slice(index)
}

/** A complete, self-contained .squint/brief.md for one family. */
export function renderFamilyBrief(family: Family): string {
  return `You are acting as a senior product designer and frontend engineer. Treat every change as production work, not a demo. This project has a committed design direction — hold it consistently in every change.

${family.direction}

${coreStandards()}`
}
