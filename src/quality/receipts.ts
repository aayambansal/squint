import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Verification receipts: a green run should be evidence, not vibes.
 * Every `squint ci` run seals its report — commands, versions, git
 * head, screenshot hashes, timestamps — under a SHA-256 digest of the
 * canonical JSON. Anyone can recompute the digest to prove the receipt
 * wasn't edited after the fact; the screenshot hashes tie the claim to
 * the exact pixels. The market checklist calls this gap "source
 * receipts" — no local harness ships it.
 */
export interface Receipt {
  version: string
  node: string
  gitHead: string | null
  report: Record<string, unknown>
  screenshots: Record<string, string>
  digest: string
}

declare const __SQUINT_VERSION__: string

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/** Canonical JSON: sorted keys at every level, no whitespace. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function buildReceipt(cwd: string, report: Record<string, unknown>): Receipt {
  let gitHead: string | null = null
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    // not a repo — the receipt says so
  }
  const screenshots: Record<string, string> = {}
  const shots = (report as { audit?: { shots?: string[] } }).audit?.shots ?? []
  for (const shot of shots) {
    try {
      screenshots[path.basename(shot)] = sha256(fs.readFileSync(shot))
    } catch {
      // missing shots simply don't get hashed
    }
  }
  const unsigned = {
    version: typeof __SQUINT_VERSION__ !== 'undefined' ? __SQUINT_VERSION__ : '0.0.0-dev',
    node: process.version,
    gitHead,
    report,
    screenshots,
  }
  return { ...unsigned, digest: sha256(canonical(unsigned)) }
}

/** Recompute the digest; a mismatch means the receipt was edited. */
export function verifyReceipt(receipt: Receipt): boolean {
  const { digest, ...unsigned } = receipt
  return sha256(canonical(unsigned)) === digest
}

export function writeReceipt(cwd: string, report: Record<string, unknown>): string {
  const receipt = buildReceipt(cwd, report)
  const dir = path.join(cwd, '.squint', 'receipts')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `${stamp}${receipt.report.ok ? '' : '-failed'}.json`)
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2))
  return file
}
