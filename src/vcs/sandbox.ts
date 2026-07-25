import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Sandbox mode (Plandex's cumulative diff, squint-shaped): a hidden
 * detached worktree where asks accumulate across turns. The whole loop
 * (dev server, probe, review) can target it; nothing touches the real
 * tree until apply. Built on the same git plumbing as variants.
 */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function sandboxDir(cwd: string): string {
  return path.join(cwd, '.squint', 'sandbox')
}

export function sandboxExists(cwd: string): boolean {
  return fs.existsSync(path.join(sandboxDir(cwd), '.git'))
}

/** Create (or reuse) the sandbox worktree from HEAD; symlink node_modules. */
export function openSandbox(cwd: string): { dir: string; reused: boolean } {
  const dir = sandboxDir(cwd)
  // Keep the worktree (and apply patches) out of the main repo's status.
  void import('../state/state.js').then(({ ensureSquintIgnore }) => ensureSquintIgnore(cwd)).catch(() => {})
  if (sandboxExists(cwd)) return { dir, reused: true }
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  git(cwd, ['worktree', 'add', '--force', '--detach', dir, 'HEAD'])
  const mainModules = path.join(cwd, 'node_modules')
  const sandboxModules = path.join(dir, 'node_modules')
  if (fs.existsSync(mainModules) && !fs.existsSync(sandboxModules)) {
    fs.symlinkSync(mainModules, sandboxModules, 'dir')
  }
  return { dir, reused: false }
}

/** Compact summary of accumulated sandbox changes, or null when clean. */
export function sandboxDiffStat(cwd: string): string | null {
  if (!sandboxExists(cwd)) return null
  const dir = sandboxDir(cwd)
  try {
    git(dir, ['add', '-A'])
    const stat = git(dir, ['diff', '--cached', '--shortstat', 'HEAD'])
    return stat.length > 0 ? stat : null
  } catch {
    return null
  }
}

/** Per-file name-status of accumulated changes (A/M/D paths). */
export function sandboxFiles(cwd: string): string[] {
  if (!sandboxExists(cwd)) return []
  const dir = sandboxDir(cwd)
  try {
    git(dir, ['add', '-A'])
    const out = git(dir, ['diff', '--cached', '--name-status', 'HEAD'])
    return out.length > 0 ? out.split('\n') : []
  } catch {
    return []
  }
}

/** Land the sandbox's accumulated diff onto the real working tree. */
export function applySandbox(cwd: string): { ok: boolean; detail?: string } {
  if (!sandboxExists(cwd)) return { ok: false, detail: 'no sandbox open' }
  const dir = sandboxDir(cwd)
  try {
    git(dir, ['add', '-A'])
    const patch = git(dir, ['diff', '--binary', '--cached', 'HEAD'])
    if (patch.length === 0) return { ok: false, detail: 'sandbox has no changes' }
    const patchFile = path.join(cwd, '.squint', 'sandbox.patch')
    fs.writeFileSync(patchFile, patch + '\n')
    git(cwd, ['apply', '--whitespace=nowarn', patchFile])
    fs.rmSync(patchFile, { force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.split('\n')[0] : String(err) }
  }
}

export function discardSandbox(cwd: string): boolean {
  if (!sandboxExists(cwd)) return false
  const dir = sandboxDir(cwd)
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
  try {
    git(cwd, ['worktree', 'prune'])
  } catch {
    // best effort
  }
  return true
}
