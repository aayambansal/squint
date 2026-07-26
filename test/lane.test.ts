import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Session } from '../src/session/engine.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-lane-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@e.c'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir })
  fs.writeFileSync(path.join(dir, 'app.ts'), 'export const x = 1\n')
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

function waitFor(session: Session, predicate: () => boolean, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (predicate()) return resolve()
    const timer = setTimeout(() => reject(new Error('waitFor timeout')), timeoutMs)
    const unsub = session.subscribe(() => {
      if (predicate()) {
        clearTimeout(timer)
        unsub()
        resolve()
      }
    })
  })
}

describe('the review lane', () => {
  it('runs a second read-only pass over the diff, once, with the diff in the prompt', async () => {
    const prompts: string[] = []
    const engine: Engine = {
      id: 'fake',
      name: 'Fake',
      binary: 'node',
      install: 'n/a',
      supportsResume: false,
      buildArgs: (opts) => {
        prompts.push(opts.prompt)
        if (prompts.length === 1) {
          // First turn edits a tracked file, so the lane has a diff to review.
          return ['-e', `require('fs').writeFileSync('app.ts', 'export const x = 2\\n'); console.log('edited')`]
        }
        return ['-e', "console.log('lane finding: none, clean diff')"]
      },
    }
    vi.spyOn(registry, 'getEngine').mockReturnValue(engine)
    const session = new Session({ cwd: dir, engineId: 'fake' })

    session.command('/lane on')
    session.input('bump x')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('lane finding')),
    )

    expect(session.getState().items.some((i) => i.role === 'user' && i.text === '🔎 lane review')).toBe(true)
    expect(prompts.length).toBe(2)
    expect(prompts[1]).toContain('second reviewer in fresh context')
    expect(prompts[1]).toContain('-export const x = 1')
    expect(prompts[1]).toContain('+export const x = 2')
  })

  it('/lane off keeps single turns single', async () => {
    const prompts: string[] = []
    const engine: Engine = {
      id: 'fake',
      name: 'Fake',
      binary: 'node',
      install: 'n/a',
      supportsResume: false,
      buildArgs: (opts) => {
        prompts.push(opts.prompt)
        return ['-e', `require('fs').writeFileSync('app.ts', 'export const x = 3\\n'); console.log('done-solo')`]
      },
    }
    vi.spyOn(registry, 'getEngine').mockReturnValue(engine)
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.input('bump again')
    await waitFor(session, () => session.getState().items.some((i) => i.text.includes('done-solo')))
    await new Promise((r) => setTimeout(r, 400))
    expect(prompts.length).toBe(1)
  })
})
