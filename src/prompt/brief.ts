import fs from 'node:fs'
import path from 'node:path'

/**
 * The design brief wrapped around every ask: squint's opinion about what
 * good frontend work looks like. Projects can replace it with .squint/brief.md.
 */
export const DEFAULT_BRIEF = `You are acting as a senior product designer and frontend engineer. Treat every change as production work, not a demo.

Design standards:
- Commit to a clear visual direction before writing code. Derive it from the product's purpose and any existing styles in the repo — never default to a generic template look.
- Work from tokens: one spacing scale (4/8px based), one type scale with a real hierarchy, one deliberate palette with sufficient contrast (WCAG AA minimum).
- Avoid the generic AI aesthetic: indigo-to-purple gradients, glassmorphism cards on white, emoji as icons, centered hero + three feature cards, uncustomized component-library defaults.
- Details carry the quality: hover/focus/active states on every interactive element, visible keyboard focus, empty/loading/error states, motion kept subtle (150–250ms, ease-out).

Engineering standards:
- Follow the repo's existing conventions, framework, and component patterns; extend them rather than importing a new style.
- Semantic HTML first; components small and focused; no dead code or unused styles.
- Responsive from 360px up. Test intermediate widths, not just phone/desktop.
- The work is not done until the app builds cleanly and renders without console errors.`

export interface BriefOptions {
  cwd: string
  /** Skip the brief entirely (pass the ask through untouched). */
  noBrief?: boolean
}

export function loadBrief(cwd: string): string {
  const custom = path.join(cwd, '.squint', 'brief.md')
  try {
    const text = fs.readFileSync(custom, 'utf8').trim()
    if (text.length > 0) return text
  } catch {
    // fall through to default
  }
  return DEFAULT_BRIEF
}

export function composePrompt(ask: string, opts: BriefOptions): string {
  if (opts.noBrief) return ask
  const brief = loadBrief(opts.cwd)
  return `${brief}\n\n## Task\n\n${ask}`
}
