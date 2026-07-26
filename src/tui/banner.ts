/**
 * Verdict banners: a PASS/FAIL headline that reads across the room.
 * On terminals speaking the OSC 66 text-sizing protocol (kitty, foot,
 * Ghostty), the line renders double-height; everywhere else it falls
 * back to a boxed single-height banner. Pure escape sequences — no
 * dependency, no measurement of the terminal beyond an env sniff.
 */
export type Verdict = 'pass' | 'fail' | 'warn'

const GLYPH: Record<Verdict, string> = { pass: '✓', fail: '✗', warn: '⚠' }

/** True when the terminal advertises OSC 66 text sizing (kitty/foot/Ghostty). */
export function supportsTextSizing(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SQUINT_NO_BANNER) return false
  if (env.TERM === 'xterm-kitty' || env.KITTY_WINDOW_ID) return true
  const program = (env.TERM_PROGRAM || '').toLowerCase()
  return program === 'ghostty' || program === 'foot' || env.GHOSTTY_RESOURCES_DIR !== undefined
}

/** OSC 66 scaled text: `\x1b]66;s=<scale>;<text>\x07`. */
function scaled(text: string, scale: number): string {
  return `\x1b]66;s=${scale};${text}\x07`
}

/** Render a verdict banner as an array of lines (no trailing newlines). */
export function verdictBanner(verdict: Verdict, label: string, env?: NodeJS.ProcessEnv): string[] {
  const headline = `${GLYPH[verdict]} ${label}`
  if (supportsTextSizing(env)) {
    return [scaled(headline, 2)]
  }
  // Boxed single-height fallback: a rule the eye still catches.
  const width = Math.min(headline.length + 4, 64)
  const rule = '─'.repeat(width)
  const pad = ' '.repeat(Math.max(0, width - headline.length - 2))
  return [`┌${rule}┐`, `│ ${headline}${pad}│`, `└${rule}┘`]
}
