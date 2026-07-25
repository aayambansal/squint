import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Session } from '../src/session/engine.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-session-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Fake engine that speaks the normalized protocol through node -e. */
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

describe('Session', () => {
  it('runs a turn: transcript, totals, and running flag lifecycle', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('did the thing')"))
    const session = new Session({ cwd: dir, engineId: 'fake' })

    session.input('build something')
    await waitFor(session, () => !session.getState().running && session.getState().totals.turns === 1)

    const roles = session.getState().items.map((i) => `${i.role}:${i.text.split('\n')[0]}`)
    expect(roles[0]).toBe('user:build something')
    expect(roles.some((r) => r.startsWith('assistant:did the thing'))).toBe(true)
    expect(roles.some((r) => r.startsWith('status:done'))).toBe(true)
    session.dispose()
  })

  it('routes slash commands: engine switch, model, help, unknown', () => {
    const session = new Session({ cwd: dir, engineId: 'claude' })
    session.input('/engine codex')
    expect(session.getState().engineId).toBe('codex')
    session.input('/model gpt-5')
    expect(session.getState().model).toBe('gpt-5')
    session.input('/model')
    expect(session.getState().model).toBeUndefined()
    session.input('/nope')
    expect(session.getState().items.at(-1)?.text).toContain('unknown command /nope')
    session.input('/engine not-real')
    expect(session.getState().items.at(-1)?.text).toContain('Unknown engine')
    session.dispose()
  })

  it('clears transcript, totals, and persisted state on /clear', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('x')"))
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.input('do it')
    await waitFor(session, () => session.getState().totals.turns === 1)
    session.input('/clear')
    expect(session.getState().items).toEqual([])
    expect(session.getState().totals).toEqual({ costUsd: 0, turns: 0 })
    session.dispose()
  })

  it('reports quit through the onQuit callback', () => {
    let quit = false
    const session = new Session({ cwd: dir, engineId: 'claude', onQuit: () => (quit = true) })
    session.input('/quit')
    expect(quit).toBe(true)
  })

  it('surfaces a resume hint when previous state exists', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.squint', 'state.json'),
      JSON.stringify({ engine: 'claude', sessionId: 's-9', lastAsk: 'old ask', at: Date.now() - 120000 }),
    )
    const session = new Session({ cwd: dir, engineId: 'claude' })
    expect(session.getState().items[0]?.text).toContain('/resume to continue')
    session.input('/resume')
    expect(session.getState().items.at(-1)?.text).toContain('resumed claude session')
    session.dispose()
  })

  it('queues asks typed mid-turn and dispatches them in order', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(
      fakeEngine("setTimeout(() => console.log('slow done'), 400)"),
    )
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.input('first ask')
    await waitFor(session, () => session.getState().running)
    session.input('second ask')
    session.input('third ask')
    expect(session.getState().queue).toEqual(['second ask', 'third ask'])

    await waitFor(session, () => session.getState().totals.turns === 3, 15000)
    const users = session.getState().items.filter((i) => i.role === 'user').map((i) => i.text)
    expect(users).toEqual(['first ask', 'second ask', 'third ask'])
    expect(session.getState().queue).toEqual([])
    session.dispose()
  })

  it('clears the queue on /queue clear mid-turn', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(
      fakeEngine("setTimeout(() => console.log('done'), 500)"),
    )
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.input('first')
    await waitFor(session, () => session.getState().running)
    session.input('second')
    session.input('/queue clear')
    expect(session.getState().queue).toEqual([])
    await waitFor(session, () => !session.getState().running, 15000)
    expect(session.getState().totals.turns).toBe(1)
    session.dispose()
  })

  it('reports interrupted runs without counting a turn', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(
      fakeEngine("setInterval(() => console.log('tick'), 100)"),
    )
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.input('never ends')
    await waitFor(session, () => session.getState().running)
    setTimeout(() => session.interrupt(), 200)
    await waitFor(session, () => !session.getState().running)
    expect(session.getState().totals.turns).toBe(0)
    expect(session.getState().items.some((i) => i.text === 'interrupted')).toBe(true)
    session.dispose()
  })
})
