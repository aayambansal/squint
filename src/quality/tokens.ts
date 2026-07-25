import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Design-token drift guard: deterministic, per-turn (the 2026 failure
 * modes are token fabrication and within-session drift, and every
 * standalone tool runs at CI time — too late). We index the repo's CSS
 * custom properties, then scan each turn's added lines for hardcoded
 * colors and suggest the nearest existing token.
 */
export interface TokenIndex {
  /** name → raw value, colors only (parseable to rgb). */
  colors: Map<string, { value: string; rgb: [number, number, number] }>
}

const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
const VAR_DEF_RE = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g

export function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (full.length !== 6) return null
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Index color tokens from the project's CSS files (capped scan). */
export function loadTokenIndex(cwd: string): TokenIndex {
  const colors = new Map<string, { value: string; rgb: [number, number, number] }>()
  const cssFiles: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || cssFiles.length > 30) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name.endsWith('.css')) cssFiles.push(full)
    }
  }
  walk(path.join(cwd, 'src'), 0)
  walk(cwd, 1)

  for (const file of cssFiles.slice(0, 30)) {
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(VAR_DEF_RE)) {
      const value = match[2]!.trim()
      const hex = value.match(/#[0-9a-fA-F]{3,6}\b/)?.[0]
      const rgbFn = /rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value)
      let rgb: [number, number, number] | null = null
      if (hex) rgb = parseHex(hex)
      else if (rgbFn) rgb = [Number(rgbFn[1]), Number(rgbFn[2]), Number(rgbFn[3])]
      if (rgb) colors.set(match[1]!, { value, rgb })
    }
  }
  return { colors }
}

export interface DriftFinding {
  file: string
  literal: string
  token: string
  distance: number
}

const distance = (a: [number, number, number], b: [number, number, number]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

/**
 * Scan a turn's added lines (git diff vs the checkpoint) for hardcoded
 * hex colors and name the nearest token. Lines that DEFINE tokens are
 * exempt — adding tokens is the system working.
 */
export function scanDrift(cwd: string, source: string, index: TokenIndex): DriftFinding[] {
  if (index.colors.size === 0) return []
  let diff: string
  try {
    diff = execFileSync('git', ['diff', '-U0', source, '--', '*.css', '*.tsx', '*.jsx', '*.ts', '*.html'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return []
  }
  const findings: DriftFinding[] = []
  let currentFile = ''
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      continue
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    if (/--[a-zA-Z0-9-_]+\s*:/.test(line)) continue // token definitions are fine
    for (const match of line.matchAll(HEX_RE)) {
      const rgb = parseHex(match[0])
      if (!rgb) continue
      let best: { token: string; d: number } | null = null
      for (const [token, entry] of index.colors) {
        const d = distance(rgb, entry.rgb)
        if (!best || d < best.d) best = { token, d }
      }
      if (best) {
        findings.push({ file: currentFile, literal: match[0], token: best.token, distance: Math.round(best.d) })
      }
      if (findings.length >= 10) return findings
    }
  }
  return findings
}

export function driftSummary(findings: DriftFinding[]): string {
  return findings
    .map(
      (f) =>
        `${f.file}: ${f.literal} → use var(${f.token})${f.distance === 0 ? ' (exact match)' : ` (closest, Δ${f.distance})`}`,
    )
    .join('\n')
}
