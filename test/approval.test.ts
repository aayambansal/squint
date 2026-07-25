import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Session } from '../src/session/engine.js'
import { loadDecisions } from '../src/session/designLog.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-approval-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

function fakeEngine(script: string): Engine {
  return {
    id: 'fake',
    name: 'Fake',
    binary: 'node',
    install: 'n/a',
    supportsResume: false,
    buildArgs: () => ['-e', script],
  }
}

function waitFor(session: Session, predicate: () => boolean, timeoutMs = 8000): Promise<void> {
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

describe('visual approval', () => {
  it('surfaces an engine-written request and routes /yes back with the decision logged', async () => {
    const write = `require('fs').mkdirSync('.squint',{recursive:true});require('fs').writeFileSync('.squint/approval-request.json',JSON.stringify({summary:'replace the hero with a split layout'}));console.log('proposing')`
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine(write))
    const session = new Session({ cwd: dir, engineId: 'fake' })

    session.input('rework the hero')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'status' && i.text.includes('approval requested: replace the hero')),
    )
    expect(fs.existsSync(path.join(dir, '.squint', 'approval-request.json'))).toBe(false)

    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('proceeding with split layout')"))
    session.command('/yes ship it')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('proceeding with split layout')),
    )

    const shown = session.getState().items.find((i) => i.role === 'user' && i.text.includes('approved'))
    expect(shown?.text).toBe('✓ approved — ship it')
    const decisions = loadDecisions(dir)
    expect(decisions.at(-1)?.decision).toBe('approved: replace the hero with a split layout — ship it')
    expect(decisions.at(-1)?.source).toBe('approval')
  })

  it('/no rejects and /yes without a pending request explains itself', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('ok')"))
    const session = new Session({ cwd: dir, engineId: 'fake' })

    session.command('/yes')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'status' && i.text.includes('nothing awaiting approval')),
    )

    const write = `require('fs').mkdirSync('.squint',{recursive:true});require('fs').writeFileSync('.squint/approval-request.json',JSON.stringify({summary:'go brutalist'}));console.log('asking')`
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine(write))
    session.input('restyle everything')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'status' && i.text.includes('approval requested: go brutalist')),
    )

    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('standing by')"))
    session.command('/no too loud')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('standing by')),
    )
    expect(loadDecisions(dir).at(-1)?.decision).toBe('rejected: go brutalist — too loud')
  })
})
