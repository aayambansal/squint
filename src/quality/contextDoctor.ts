import fs from 'node:fs'
import path from 'node:path'
import { loadBrief } from '../prompt/brief.js'
import { inventorySection, loadComponentInventory } from '../prompt/registry.js'
import { loadLocks, loadRules, loadSkills } from '../prompt/skills.js'
import { decisionsSection, loadDecisions } from '../session/designLog.js'

/**
 * The context doctor: what squint injects into every ask, costed per
 * source, with staleness warnings. Injection is squint's whole edge —
 * and its failure mode. A 4k-token brief, a lock pointing at a deleted
 * file, a skill whose trigger never fires: each is invisible until you
 * itemize the bill.
 */
export interface ContextLine {
  source: string
  tokens: number
  when: string
  note?: string
}

export interface ContextReport {
  lines: ContextLine[]
  warnings: string[]
  totalAlways: number
}

const tokens = (text: string): number => Math.ceil(text.length / 4)

export function contextReport(cwd: string): ContextReport {
  const lines: ContextLine[] = []
  const warnings: string[] = []

  const brief = loadBrief(cwd)
  const custom = fs.existsSync(path.join(cwd, '.squint', 'brief.md'))
  lines.push({ source: custom ? 'brief (.squint/brief.md)' : 'brief (built-in)', tokens: tokens(brief), when: 'first turn' })
  if (tokens(brief) > 1500) warnings.push(`the brief is ${tokens(brief)} tokens — past ~1500 the engine starts skimming; distill it`)

  const rules = loadRules(cwd)
  if (rules) {
    lines.push({ source: 'rules (.squint/rules.md)', tokens: tokens(rules), when: 'every ask' })
    if (tokens(rules) > 800) warnings.push(`rules.md is ${tokens(rules)} tokens of always-on context — move situational parts into triggered skills`)
  }

  const decisions = decisionsSection(cwd)
  if (decisions) {
    lines.push({ source: `design ledger (${loadDecisions(cwd).length} recent decisions)`, tokens: tokens(decisions), when: 'every ask' })
  }

  const inventory = loadComponentInventory(cwd)
  if (inventory) {
    lines.push({ source: 'component inventory', tokens: tokens(inventorySection(inventory)), when: 'every ask' })
  }

  const locks = loadLocks(cwd)
  if (locks.length > 0) {
    lines.push({ source: `locks (${locks.length} paths)`, tokens: tokens(locks.join('\n')) + 40, when: 'every ask' })
    for (const lock of locks) {
      if (!fs.existsSync(path.join(cwd, lock))) warnings.push(`stale lock: ${lock} no longer exists — remove it from .squint/locks`)
    }
  }

  for (const skill of loadSkills(cwd)) {
    lines.push({
      source: `skill: ${skill.name}`,
      tokens: tokens(skill.body),
      when: `when the ask mentions ${skill.triggers.map((t) => `"${t}"`).join(', ')}`,
    })
    const generic = skill.triggers.filter((t) => t.length <= 3)
    if (generic.length > 0) {
      warnings.push(`skill "${skill.name}" has trigger(s) ${generic.map((t) => `"${t}"`).join(', ')} short enough to match almost any ask — make them more specific`)
    }
  }

  const totalAlways = lines.filter((l) => l.when === 'every ask').reduce((sum, l) => sum + l.tokens, 0)
  if (totalAlways > 3000) warnings.push(`~${totalAlways} tokens ride on every single ask — that is real money and real attention; trim the always-on set`)

  return { lines, warnings, totalAlways }
}

export function formatContextReport(report: ContextReport): string {
  const width = Math.max(...report.lines.map((l) => l.source.length), 10)
  const rows = report.lines.map((l) => `  ${l.source.padEnd(width)}  ~${String(l.tokens).padStart(5)} tok  ${l.when}`)
  const out = [`what squint injects (estimates):`, ...rows, `  ${'always-on total'.padEnd(width)}  ~${String(report.totalAlways).padStart(5)} tok  every ask`]
  if (report.warnings.length > 0) {
    out.push('', 'warnings:', ...report.warnings.map((w) => `  ⚠ ${w}`))
  }
  return out.join('\n')
}
