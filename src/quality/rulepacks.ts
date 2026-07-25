import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Version-aware rule-packs: static lint of each turn's added lines for
 * patterns that were right in an older major of the project's own
 * toolchain. Tailwind v4 is the documented agent failure mode (v3
 * classes hallucinated into v4 projects compile to nothing); the
 * phantom-class check catches those at runtime, this catches them at
 * gate time with the exact rename in hand — and also the crueler trap:
 * classes that still exist in v4 but mean something one step off.
 *
 * `hard` findings name classes that no longer exist (join the problems
 * list, eligible for auto-fix); soft findings are renamed-scale traps
 * surfaced as advisory pressure only.
 */
export interface RuleFinding {
  file: string
  match: string
  hint: string
  hard: boolean
}

interface Rule {
  re: RegExp
  hint: (match: string) => string
  hard: boolean
}

const TAILWIND_V4_RULES: Rule[] = [
  {
    re: /\bbg-gradient-to-(t|tr|r|br|b|bl|l|tl)\b/g,
    hint: (m) => `${m} is v3 — v4 renamed it bg-linear-to-${m.split('-').pop()}`,
    hard: true,
  },
  {
    re: /\bflex-(shrink|grow)(-\d+)?\b/g,
    hint: (m) => `${m} is v3 — v4 uses ${m.replace('flex-', '')}`,
    hard: true,
  },
  {
    re: /\boverflow-ellipsis\b/g,
    hint: () => 'overflow-ellipsis is v3 — v4 uses text-ellipsis',
    hard: true,
  },
  {
    re: /\bdecoration-(slice|clone)\b/g,
    hint: (m) => `${m} is v3 — v4 uses box-${m}`,
    hard: true,
  },
  {
    re: /\b(shadow|rounded|blur|drop-shadow)-sm\b/g,
    hint: (m) => `${m} means one step larger in v4 (the scale shifted; v3 ${m} is now ${m.replace(/-sm$/, '-xs')}) — verify the intent`,
    hard: false,
  },
  {
    re: /\boutline-none\b/g,
    hint: () => 'outline-none changed meaning in v4 (now outline-style: none; the old invisible-but-accessible reset is outline-hidden) — verify the intent',
    hard: false,
  },
]

const VITE_RULES: Rule[] = [
  {
    re: /\bsplitVendorChunkPlugin\b/g,
    hint: () => 'splitVendorChunkPlugin was removed — use build.rollupOptions.output.manualChunks',
    hard: true,
  },
  {
    re: /\boptimizeDeps:\s*\{[^}]*esbuildOptions\b|\besbuildOptions\b/g,
    hint: () => 'optimizeDeps.esbuildOptions is esbuild-era — Rolldown Vite uses optimizeDeps.rollupOptions',
    hard: false,
  },
]

function readPackageJson(cwd: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function depMajor(pkg: Record<string, unknown> | null, name: string): number | null {
  if (!pkg) return null
  for (const key of ['dependencies', 'devDependencies']) {
    const deps = pkg[key] as Record<string, string> | undefined
    const range = deps?.[name]
    const major = range?.match(/(\d+)/)?.[1]
    if (major) return Number.parseInt(major, 10)
  }
  return null
}

export function detectTailwindMajor(cwd: string): number | null {
  const pkg = readPackageJson(cwd)
  const major = depMajor(pkg, 'tailwindcss')
  if (major !== null) return major
  // The v4 Vite plugin implies v4 even when tailwindcss itself is transitive.
  if (depMajor(pkg, '@tailwindcss/vite') !== null) return 4
  return null
}

export function detectViteMajor(cwd: string): number | null {
  return depMajor(readPackageJson(cwd), 'vite')
}

/** Scan the turn's added lines (diff vs `source`) against the active rule-packs. */
export function scanRulePacks(cwd: string, source: string): RuleFinding[] {
  const packs: { rules: Rule[]; files?: RegExp }[] = []
  const tailwind = detectTailwindMajor(cwd)
  if (tailwind !== null && tailwind >= 4) packs.push({ rules: TAILWIND_V4_RULES })
  const vite = detectViteMajor(cwd)
  if (vite !== null && vite >= 6) packs.push({ rules: VITE_RULES, files: /vite\.config\.[cm]?[jt]s$/ })
  if (packs.length === 0) return []

  let diff: string
  try {
    diff = execFileSync('git', ['diff', '-U0', source, '--', '*.tsx', '*.jsx', '*.ts', '*.js', '*.html', '*.css', '*.vue', '*.svelte'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return []
  }

  const findings: RuleFinding[] = []
  const seen = new Set<string>()
  let currentFile = ''
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      if (tailwind !== null && tailwind >= 4 && /(^|\/)tailwind\.config\.[cm]?[jt]s$/.test(currentFile)) {
        findings.push({
          file: currentFile,
          match: 'tailwind.config',
          hint: 'Tailwind v4 is CSS-first — configure with @theme in your CSS, not a tailwind.config file',
          hard: true,
        })
      }
      continue
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    for (const pack of packs) {
      if (pack.files && !pack.files.test(currentFile)) continue
      for (const rule of pack.rules) {
        for (const match of line.matchAll(rule.re)) {
          const key = `${currentFile}:${match[0]}`
          if (seen.has(key)) continue
          seen.add(key)
          findings.push({ file: currentFile, match: match[0], hint: rule.hint(match[0]), hard: rule.hard })
          if (findings.length >= 12) return findings
        }
      }
    }
  }
  return findings
}

export function rulePackSummary(findings: RuleFinding[]): string {
  return findings.map((f) => `  ${f.file}: ${f.hint}`).join('\n')
}
