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
  /** When the check runs: every turn (default), full audits only, or on wall-clock time. */
  trigger: 'turn' | 'audit' | 'interval'
  /** Seconds between runs for interval checks (default 300). */
  intervalSec?: number
}

const MAX_CHECKS = 20
const MAX_BYTES = 10_000

export function loadChecks(cwd: string, context: 'turn' | 'audit' | 'interval' = 'audit'): PageCheck[] {
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
      // First-line pragma: // squint-trigger: audit | interval[:seconds]
      const pragma = /^\s*\/\/\s*squint-trigger:\s*(turn|audit|interval)(?::(\d+))?/.exec(source)
      const trigger = pragma?.[1] === 'audit' ? 'audit' : pragma?.[1] === 'interval' ? 'interval' : 'turn'
      checks.push({
        name: entry.replace(/\.js$/, ''),
        source,
        trigger,
        intervalSec: trigger === 'interval' ? Number.parseInt(pragma?.[2] ?? '300', 10) : undefined,
      })
    } catch {
      // unreadable checks never break a probe
    }
  }
  // Full audits run turn+audit checks; per-turn probes run turn checks;
  // interval checks belong to the daemon's clock alone.
  if (context === 'audit') return checks.filter((c) => c.trigger !== 'interval')
  if (context === 'interval') return checks.filter((c) => c.trigger === 'interval')
  return checks.filter((c) => c.trigger === 'turn')
}

/** Run due interval checks against a live URL; returns failure lines. */
export async function runIntervalSweep(
  cwd: string,
  url: string,
  lastRun: Map<string, number>,
): Promise<string[]> {
  const now = Date.now()
  const due = loadChecks(cwd, 'interval').filter(
    (c) => now - (lastRun.get(c.name) ?? 0) >= (c.intervalSec ?? 300) * 1000,
  )
  if (due.length === 0) return []
  for (const check of due) lastRun.set(check.name, now)
  const { findChrome } = await import('./chrome.js')
  const chrome = findChrome()
  if (!chrome) return []
  const os = await import('node:os')
  const { cdpCapture } = await import('./cdp.js')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-interval-'))
  try {
    const result = await cdpCapture(chrome, url, tmp, [], 800, false, due)
    return result.checkFailures
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
