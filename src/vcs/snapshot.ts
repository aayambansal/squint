import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Turn-level undo for git repos: before each ask, capture the working
 * tree (a dangling stash commit — nothing touches the index, refs, or
 * user stashes); /undo restores that exact state, including deleting
 * files the turn created. Lovable's "every message is restorable",
 * built on plumbing git already has.
 */
export interface Snapshot {
  /** Dangling commit capturing tracked state; null = tree was clean (HEAD). */
  stashHash: string | null
  /** Untracked files present at snapshot time (kept on restore). */
  untracked: string[]
  at: number
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function isGitRepo(cwd: string): boolean {
  try {
    return git(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true'
  } catch {
    return false
  }
}

function listUntracked(cwd: string): string[] {
  const out = git(cwd, ['ls-files', '--others', '--exclude-standard'])
  return out.length > 0 ? out.split('\n') : []
}

export function takeSnapshot(cwd: string): Snapshot | null {
  try {
    if (!isGitRepo(cwd)) return null
    // Requires at least one commit; a repo without HEAD can't snapshot.
    git(cwd, ['rev-parse', 'HEAD'])
    const stashHash = git(cwd, ['stash', 'create']) || null
    return { stashHash, untracked: listUntracked(cwd), at: Date.now() }
  } catch {
    return null
  }
}

export interface RestoreResult {
  restored: boolean
  deletedFiles: number
  detail?: string
}

export function restoreSnapshot(cwd: string, snapshot: Snapshot): RestoreResult {
  try {
    // Delete files created since the snapshot (untracked then, absent before).
    const before = new Set(snapshot.untracked)
    const created = listUntracked(cwd).filter((file) => !before.has(file))
    for (const file of created) {
      fs.rmSync(path.join(cwd, file), { force: true })
    }
    // Restore tracked files to their snapshot (or HEAD) state.
    const source = snapshot.stashHash ?? 'HEAD'
    git(cwd, ['restore', '--source', source, '--worktree', '--', '.'])
    return { restored: true, deletedFiles: created.length }
  } catch (err) {
    return {
      restored: false,
      deletedFiles: 0,
      detail: err instanceof Error ? err.message.split('\n')[0] : String(err),
    }
  }
}
