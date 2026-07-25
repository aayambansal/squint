import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diffStatSince, isGitRepo, restoreSnapshot, takeSnapshot } from '../src/vcs/snapshot.js'

let dir: string

function git(...args: string[]) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-snap-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'original a\n')
  fs.writeFileSync(path.join(dir, 'b.txt'), 'original b\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('snapshot/restore', () => {
  it('detects git repos', () => {
    expect(isGitRepo(dir)).toBe(true)
    expect(isGitRepo(os.tmpdir())).toBe(false)
  })

  it('reverts modifications, deletions, and new files from a clean start', () => {
    const snapshot = takeSnapshot(dir)!
    expect(snapshot).not.toBeNull()
    expect(snapshot.stashHash).toBeNull() // clean tree

    // Simulate an agent turn: modify, delete, create.
    fs.writeFileSync(path.join(dir, 'a.txt'), 'mangled\n')
    fs.rmSync(path.join(dir, 'b.txt'))
    fs.writeFileSync(path.join(dir, 'new.txt'), 'created\n')

    const result = restoreSnapshot(dir, snapshot)
    expect(result.restored).toBe(true)
    expect(result.deletedFiles).toBe(1)
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('original a\n')
    expect(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8')).toBe('original b\n')
    expect(fs.existsSync(path.join(dir, 'new.txt'))).toBe(false)
  })

  it('preserves the user\'s own uncommitted work from before the turn', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'my uncommitted edit\n')
    fs.writeFileSync(path.join(dir, 'wip.txt'), 'my scratch file\n')

    const snapshot = takeSnapshot(dir)!
    expect(snapshot.stashHash).not.toBeNull()
    expect(snapshot.untracked).toContain('wip.txt')

    fs.writeFileSync(path.join(dir, 'a.txt'), 'agent overwrote this\n')
    fs.writeFileSync(path.join(dir, 'agent.txt'), 'agent file\n')

    const result = restoreSnapshot(dir, snapshot)
    expect(result.restored).toBe(true)
    // The user's pre-turn state is back — including their uncommitted edit…
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('my uncommitted edit\n')
    // …their scratch file survives, and the agent's file is gone.
    expect(fs.existsSync(path.join(dir, 'wip.txt'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'agent.txt'))).toBe(false)
  })

  it('summarizes work since a snapshot as a compact diff stat', () => {
    const snapshot = takeSnapshot(dir)!
    expect(diffStatSince(dir, snapshot)).toBeNull() // nothing changed yet
    fs.writeFileSync(path.join(dir, 'a.txt'), 'changed line\nsecond line\n')
    const stat = diffStatSince(dir, snapshot)
    expect(stat).toMatch(/^1 file \+2 −1$/)
  })

  it('returns null outside git or without commits', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-nogit-'))
    try {
      expect(takeSnapshot(bare)).toBeNull()
    } finally {
      fs.rmSync(bare, { recursive: true, force: true })
    }
  })
})
