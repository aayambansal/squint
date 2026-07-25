import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Engine } from '../src/engines/types.js'
import {
  applyVariant,
  cleanVariants,
  listVariants,
  pickFamilies,
  runVariants,
  variantPrompt,
} from '../src/variants/variants.js'
import { getFamily } from '../src/prompt/families.js'

let dir: string

function git(...args: string[]) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-variants-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.writeFileSync(path.join(dir, 'app.txt'), 'base\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
})

afterEach(() => {
  cleanVariants(dir)
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Fake engine: "designs" by writing a file named after its own cwd's family. */
const fakeEngine: Engine = {
  id: 'fake',
  name: 'Fake',
  binary: 'node',
  install: 'n/a',
  supportsResume: false,
  buildArgs: (opts) => [
    '-e',
    `require('fs').writeFileSync('design.txt', ${JSON.stringify(opts.prompt.slice(0, 40))} + process.cwd())`,
  ],
}

describe('pickFamilies / variantPrompt', () => {
  it('caps at four distinct families and demands differentiation', () => {
    expect(pickFamilies(10).length).toBe(4)
    expect(new Set(pickFamilies(4).map((f) => f.id)).size).toBe(4)
    const prompt = variantPrompt(getFamily('terminal')!, 'build a landing page')
    expect(prompt).toContain('Terminal-Core')
    expect(prompt).toContain('build a landing page')
    expect(prompt).toContain('Do not hedge toward a middle ground')
  })
})

describe('runVariants → apply → clean', { timeout: 60000 }, () => {
  it('runs parallel worktree explorations and applies the winner to the main tree', async () => {
    const statuses: string[] = []
    const runs = await runVariants(dir, 'make it nice', 2, fakeEngine, undefined, (id, text) =>
      statuses.push(`${id}: ${text}`),
    )

    expect(runs.length).toBe(2)
    expect(runs.every((r) => r.result.ok)).toBe(true)
    // Each worktree got its own design artifact…
    for (const run of runs) {
      expect(fs.existsSync(path.join(run.variant.dir, 'design.txt'))).toBe(true)
    }
    // …and the main tree is untouched so far.
    expect(fs.existsSync(path.join(dir, 'design.txt'))).toBe(false)
    expect(listVariants(dir).sort()).toEqual(runs.map((r) => r.variant.family.id).sort())

    const winner = runs[0]!.variant.family.id
    const applied = applyVariant(dir, winner)
    expect(applied.ok).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'design.txt'), 'utf8')).toContain(winner)

    const removed = cleanVariants(dir)
    expect(removed).toBe(2)
    expect(listVariants(dir)).toEqual([])
    // Worktree metadata is pruned — a fresh gen can reuse the paths.
    expect(fs.existsSync(path.join(dir, '.squint', 'variants'))).toBe(false)
  })

  it('reports a helpful error when applying a nonexistent variant', () => {
    const result = applyVariant(dir, 'nope')
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('no variant')
  })
})
