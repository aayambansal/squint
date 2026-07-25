import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteSession } from '../src/daemon/remote.js'
import { type Daemon, startDaemon } from '../src/daemon/server.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string
let daemon: Daemon | null = null
const sessions: RemoteSession[] = []

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-remote-'))
})

afterEach(() => {
  for (const session of sessions) session.dispose()
  sessions.length = 0
  daemon?.close()
  daemon = null
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

function waitFor(session: RemoteSession, predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (predicate()) return resolve()
    const timer = setTimeout(() => reject(new Error('waitFor timeout')), timeoutMs)
    session.subscribe(() => {
      if (predicate()) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

describe('RemoteSession', () => {
  it('mirrors daemon state and drives turns like a local session', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('remote result')"))
    daemon = await startDaemon({ cwd: dir, engineId: 'fake' })

    const remote = await RemoteSession.connect(dir)
    sessions.push(remote)
    expect(remote.role).toBe('driver')
    expect(remote.getState().engineId).toBe('fake')

    remote.input('do it')
    await waitFor(remote, () =>
      remote.getState().items.some((i) => i.role === 'assistant' && i.text.includes('remote result')),
    )
    expect(remote.getState().totals.turns).toBe(1)
  })

  it('observer steering surfaces the denial as a local status line', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('ok')"))
    daemon = await startDaemon({ cwd: dir, engineId: 'fake' })

    const driver = await RemoteSession.connect(dir)
    const observer = await RemoteSession.connect(dir)
    sessions.push(driver, observer)
    expect(observer.role).toBe('observer')

    observer.input('let me drive')
    await waitFor(observer, () =>
      observer.getState().items.some((i) => i.role === 'status' && i.text.includes('observer')),
    )
    expect(driver.getState().items.some((i) => i.text.includes('observer'))).toBe(false)
  })
})
