import fs from 'node:fs'
import path from 'node:path'
import { type Receipt, verifyReceipt } from './receipts.js'

/**
 * Receipt comparison: two sealed runs, one regression story. The
 * nightly question isn't "is it green" but "is it greener than
 * yesterday" — gate flips, hard-finding deltas, and flow changes
 * between any two receipts, tamper-checked before trusting either.
 */
export interface ReceiptDelta {
  okBefore: boolean
  okAfter: boolean
  lines: string[]
}

interface GateRow {
  id: string
  ok: boolean
}

interface FlowRow {
  name: string
  ok: boolean
}

function gates(receipt: Receipt): GateRow[] {
  return ((receipt.report.gates as GateRow[] | undefined) ?? []).map((g) => ({ id: g.id, ok: g.ok }))
}

function flows(receipt: Receipt): FlowRow[] {
  return ((receipt.report.flows as FlowRow[] | undefined) ?? []).map((f) => ({ name: f.name, ok: f.ok }))
}

function hardCount(receipt: Receipt): number {
  const audit = receipt.report.audit as { hard?: Record<string, unknown> } | undefined
  if (!audit?.hard) return 0
  let count = 0
  for (const value of Object.values(audit.hard)) {
    if (Array.isArray(value)) count += value.length
    else if (typeof value === 'string' && value) count += 1
  }
  return count
}

export function compareReceipts(before: Receipt, after: Receipt): ReceiptDelta {
  const lines: string[] = []
  for (const receipt of [before, after]) {
    if (!verifyReceipt(receipt)) lines.push('⚠ a receipt fails digest verification — comparison untrustworthy')
  }

  const beforeGates = new Map(gates(before).map((g) => [g.id, g.ok]))
  for (const gate of gates(after)) {
    const prev = beforeGates.get(gate.id)
    if (prev === undefined) lines.push(`gate ${gate.id}: new (${gate.ok ? 'green' : 'RED'})`)
    else if (prev && !gate.ok) lines.push(`gate ${gate.id}: REGRESSED (green → red)`)
    else if (!prev && gate.ok) lines.push(`gate ${gate.id}: fixed (red → green)`)
  }

  const hardBefore = hardCount(before)
  const hardAfter = hardCount(after)
  if (hardAfter !== hardBefore) {
    lines.push(`hard audit findings: ${hardBefore} → ${hardAfter}${hardAfter > hardBefore ? ' (REGRESSED)' : ' (improved)'}`)
  }

  const beforeFlows = new Map(flows(before).map((f) => [f.name, f.ok]))
  for (const flow of flows(after)) {
    const prev = beforeFlows.get(flow.name)
    if (prev === true && !flow.ok) lines.push(`flow ${flow.name}: REGRESSED`)
    else if (prev === false && flow.ok) lines.push(`flow ${flow.name}: fixed`)
  }

  if (lines.length === 0) lines.push('no deltas — the two runs verify identically')
  return { okBefore: before.report.ok === true, okAfter: after.report.ok === true, lines }
}

/** The two newest receipts on disk, oldest first; null when fewer than two exist. */
export function latestPair(cwd: string): [Receipt, Receipt] | null {
  const dir = path.join(cwd, '.squint', 'receipts')
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return null
  }
  if (files.length < 2) return null
  const load = (f: string): Receipt => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  return [load(files.at(-2)!), load(files.at(-1)!)]
}
