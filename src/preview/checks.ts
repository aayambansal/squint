import fs from 'node:fs'
import path from 'node:path'

/**
 * Agent-authored persistent checks (the Pi move): a one-off assertion
 * the engine writes mid-session becomes `.squint/checks/<name>.js`,
 * versioned with the repo and replayed against the live page after
 * every turn. Contract: the file evaluates in the page and its value
 * is an array of failure strings — empty means pass. The capability
 * boundary is the headless probe page itself: checks can read the DOM
 * they're asserting on and nothing else.
 */
export interface PageCheck {
  name: string
  source: string
  /** When the check runs: every turn (default) or only full audits. */
  trigger: 'turn' | 'audit'
}

const MAX_CHECKS = 20
const MAX_BYTES = 10_000

export function loadChecks(cwd: string, context: 'turn' | 'audit' = 'audit'): PageCheck[] {
  const dir = path.join(cwd, '.squint', 'checks')
  let entries: string[]
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
  } catch {
    return []
  }
  const checks: PageCheck[] = []
  for (const entry of entries.sort().slice(0, MAX_CHECKS)) {
    try {
      const source = fs.readFileSync(path.join(dir, entry), 'utf8')
      if (source.trim().length === 0 || Buffer.byteLength(source) > MAX_BYTES) continue
      // First-line pragma: // squint-trigger: audit  (default: turn)
      const pragma = /^\s*\/\/\s*squint-trigger:\s*(turn|audit)/.exec(source)
      checks.push({ name: entry.replace(/\.js$/, ''), source, trigger: pragma?.[1] === 'audit' ? 'audit' : 'turn' })
    } catch {
      // unreadable checks never break a probe
    }
  }
  // Full audits run everything; per-turn probes skip audit-only checks.
  return context === 'audit' ? checks : checks.filter((c) => c.trigger === 'turn')
}
