import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, vi } from 'vitest'
import { Session } from '../src/session/engine.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-goal-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

function echoPromptEngine(): Engine {
  return {
    id: 'fake',
    name: 'Fake',
    binary: 'node',
    install: 'n/a',
    supportsResume: false,
    // Echo a marker plus whether the goal section arrived in the prompt.
    buildArgs: (opts) => ['-e', `console.log(${JSON.stringify(opts.prompt.includes('Standing goal') ? 'GOAL-RIDES' : 'NO-GOAL')})`],
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

describe('/goal', () => {
  it('arms, rides every ask, shows, and clears', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(echoPromptEngine())
    const session = new Session({ cwd: dir, engineId: 'fake' })

    session.command('/goal the pricing page must pass all checks')
    await waitFor(session, () => session.getState().items.some((i) => i.text.includes('goal armed')))

    session.input('polish the header')
    await waitFor(session, () => session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('GOAL-RIDES')))

    session.command('/goal show')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.text.includes('standing goal: the pricing page must pass all checks')),
    )

    session.command('/goal off')
    await waitFor(session, () => session.getState().items.some((i) => i.text.includes('goal cleared')))

    session.input('another ask')
    await waitFor(session, () => session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('NO-GOAL')))
  })
})
