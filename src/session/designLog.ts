import fs from 'node:fs'
import path from 'node:path'

/**
 * The design-decision ledger: append-only .squint/design-log.jsonl,
 * committed with the repo. Tools forget visual decisions across
 * sessions ("Figma Make overrides them as you prompt"); squint records
 * them at the moments it uniquely owns — a variant chosen, a rollback,
 * a sandbox landed, an explicit /decide — and re-injects the recent
 * ones into every ask. Memory with receipts (screenshots when we have
 * them).
 */
export interface DesignDecision {
  ts: string
  decision: string
  source: 'decide' | 'variant' | 'restore' | 'sandbox'
  screenshot?: string
}

function logFile(cwd: string): string {
  return path.join(cwd, '.squint', 'design-log.jsonl')
}

export function appendDecision(cwd: string, entry: Omit<DesignDecision, 'ts'>): void {
  try {
    fs.mkdirSync(path.join(cwd, '.squint'), { recursive: true })
    const record: DesignDecision = { ts: new Date().toISOString(), ...entry }
    fs.appendFileSync(logFile(cwd), JSON.stringify(record) + '\n')
  } catch {
    // the ledger never breaks a turn
  }
}

export function loadDecisions(cwd: string, limit = 8): DesignDecision[] {
  try {
    const lines = fs.readFileSync(logFile(cwd), 'utf8').trim().split('\n')
    const decisions: DesignDecision[] = []
    for (const line of lines.slice(-limit * 2)) {
      try {
        const parsed = JSON.parse(line)
        if (typeof parsed?.decision === 'string' && typeof parsed?.ts === 'string') decisions.push(parsed)
      } catch {
        // skip corrupt lines
      }
    }
    return decisions.slice(-limit)
  } catch {
    return []
  }
}

/** The prompt section: standing decisions the engine must not silently undo. */
export function decisionsSection(cwd: string): string {
  const decisions = loadDecisions(cwd)
  if (decisions.length === 0) return ''
  const lines = decisions.map((d) => {
    const days = Math.floor((Date.now() - Date.parse(d.ts)) / 86400000)
    const age = days <= 0 ? 'today' : `${days}d ago`
    return `- ${d.decision} (${d.source}, ${age}${d.screenshot ? `, evidence: ${d.screenshot}` : ''})`
  })
  return `## Design decisions on record\n\n${lines.join('\n')}\n\nThese were decided deliberately. Do not silently undo them; if a task genuinely requires reversing one, say so explicitly first.`
}
