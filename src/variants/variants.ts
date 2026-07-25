import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { FIRST_TURN_ADDENDUM } from '../prompt/brief.js'
import { FAMILIES, type Family, renderFamilyBrief } from '../prompt/families.js'
import { runAgent } from '../runner/run.js'
import type { AgentResult, Engine } from '../engines/types.js'

/**
 * Multi-variant generation: N parallel design explorations, one git
 * worktree each, every variant committed to a DIFFERENT aesthetic
 * family. Selection is cheaper than specification — generate wide,
 * pick with eyes, apply the winner's diff.
 */
export const MAX_VARIANTS = 4

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function variantsRoot(cwd: string): string {
  return path.join(cwd, '.squint', 'variants')
}

export function pickFamilies(n: number): Family[] {
  return FAMILIES.slice(0, Math.min(n, MAX_VARIANTS, FAMILIES.length))
}

export interface Variant {
  family: Family
  dir: string
}

/** Detached worktree from HEAD; node_modules symlinked from the main tree. */
export function createVariantWorktree(cwd: string, family: Family): Variant {
  const dir = path.join(variantsRoot(cwd), family.id)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  git(cwd, ['worktree', 'add', '--force', '--detach', dir, 'HEAD'])

  const mainModules = path.join(cwd, 'node_modules')
  const variantModules = path.join(dir, 'node_modules')
  if (fs.existsSync(mainModules) && !fs.existsSync(variantModules)) {
    fs.symlinkSync(mainModules, variantModules, 'dir')
  }
  return { family, dir }
}

export function variantPrompt(family: Family, ask: string): string {
  return `${renderFamilyBrief(family)}

${FIRST_TURN_ADDENDUM}

## Task

${ask}

Note: this is one of several parallel design explorations of the same task. Commit hard to the ${family.name} direction — differentiation between explorations is the point. Do not hedge toward a middle ground.`
}

export interface VariantRun {
  variant: Variant
  result: AgentResult
}

/** Run all variants in parallel; progress flows through onStatus. */
export async function runVariants(
  cwd: string,
  ask: string,
  n: number,
  engine: Engine,
  model: string | undefined,
  onStatus: (familyId: string, text: string) => void,
): Promise<VariantRun[]> {
  const families = pickFamilies(n)
  const variants = families.map((family) => {
    onStatus(family.id, 'preparing worktree')
    return createVariantWorktree(cwd, family)
  })

  return Promise.all(
    variants.map(async (variant) => {
      onStatus(variant.family.id, 'engine running')
      const result = await runAgent(
        engine,
        { prompt: variantPrompt(variant.family, ask), cwd: variant.dir, model },
        (event) => {
          if (event.type === 'tool') onStatus(variant.family.id, `⚙ ${event.name}`)
          if (event.type === 'error') onStatus(variant.family.id, `✗ ${event.text.split('\n')[0]}`)
        },
      )
      onStatus(
        variant.family.id,
        result.ok
          ? `done${result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''}`
          : `failed${result.error ? ` · ${result.error.split('\n')[0]}` : ''}`,
      )
      return { variant, result }
    }),
  )
}

export function listVariants(cwd: string): string[] {
  try {
    return fs
      .readdirSync(variantsRoot(cwd), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Apply one variant's full diff (including new files) onto the main tree. */
export function applyVariant(cwd: string, familyId: string): { ok: boolean; detail?: string } {
  const dir = path.join(variantsRoot(cwd), familyId)
  if (!fs.existsSync(dir)) {
    return { ok: false, detail: `no variant "${familyId}" — run squint variants list` }
  }
  try {
    // Stage everything in the worktree's own index so new files diff too.
    git(dir, ['add', '-A'])
    const patch = git(dir, ['diff', '--binary', '--cached', 'HEAD'])
    if (patch.length === 0) {
      return { ok: false, detail: 'variant made no changes' }
    }
    const patchFile = path.join(variantsRoot(cwd), `${familyId}.patch`)
    fs.writeFileSync(patchFile, patch + '\n')
    git(cwd, ['apply', '--whitespace=nowarn', patchFile])
    fs.rmSync(patchFile, { force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.split('\n')[0] : String(err) }
  }
}

export function cleanVariants(cwd: string): number {
  const ids = listVariants(cwd)
  for (const id of ids) {
    const dir = path.join(variantsRoot(cwd), id)
    // Break the node_modules symlink before removal so git doesn't follow it.
    try {
      const link = path.join(dir, 'node_modules')
      if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.rmSync(link)
    } catch {
      // best effort
    }
    try {
      git(cwd, ['worktree', 'remove', '--force', dir])
    } catch {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  try {
    git(cwd, ['worktree', 'prune'])
  } catch {
    // best effort
  }
  fs.rmSync(variantsRoot(cwd), { recursive: true, force: true })
  return ids.length
}
