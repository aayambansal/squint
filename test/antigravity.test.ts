import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { antigravity } from '../src/engines/antigravity.js'
import { Session } from '../src/session/engine.js'
import * as registry from '../src/engines/registry.js'

let dir: string

// The landmine, reproduced: prints ONLY when stdout is a tty, else
// exits 0 silently — exactly agy's documented behavior (issue #76).
const FAKE_AGY = `#!/usr/bin/env node
if (process.stdout.isTTY) {
  console.log('\\x1b[1mAntigravity\\x1b[0m says: landing gear retracted')
}
process.exit(0)
`

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-agy-'))
  fs.writeFileSync(path.join(dir, 'agy'), FAKE_AGY, { mode: 0o755 })
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

describe('antigravity adapter', () => {
  it('maps modes, resume, and model to agy flags', () => {
    const base = { prompt: 'polish the nav', cwd: '/tmp' }
    expect(antigravity.buildArgs({ ...base, mode: 'plan' })).toContain('--sandbox')
    expect(antigravity.buildArgs({ ...base, mode: 'yolo' })).toContain('--dangerously-skip-permissions')
    expect(antigravity.buildArgs({ ...base, mode: 'safe' })).not.toContain('--sandbox')
    expect(antigravity.buildArgs({ ...base, sessionId: 'c-9' })).toContain('--conversation')
    expect(antigravity.buildArgs({ ...base, model: 'gemini-3' })).toContain('-m')
  })

  it('the parser strips ANSI and drops spinner frames', () => {
    const parse = antigravity.createParser!()
    expect(parse('\x1b[1mAntigravity\x1b[0m says: hi\r')).toEqual([{ type: 'text', text: 'Antigravity says: hi' }])
    expect(parse('⠁⠂⠄')).toEqual([])
    expect(parse('   ')).toEqual([])
  })

  it('the pty wrap defeats the isatty landmine end to end', async () => {
    // Without the wrap: piped stdout is empty (the landmine, proven).
    const { execFileSync } = await import('node:child_process')
    const piped = execFileSync(path.join(dir, 'agy'), ['-p', 'x'], { encoding: 'utf8' })
    expect(piped).toBe('')

    // Through the real Session + runner + wrapCommand: output flows.
    const wrapped = { ...antigravity, binary: path.join(dir, 'agy') }
    vi.spyOn(registry, 'getEngine').mockReturnValue(wrapped)
    vi.spyOn(registry, 'findEngineBinary').mockReturnValue(path.join(dir, 'agy'))
    const session = new Session({ cwd: dir, engineId: 'antigravity' })
    session.input('do the thing')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('landing gear retracted')),
    )
  })
})
