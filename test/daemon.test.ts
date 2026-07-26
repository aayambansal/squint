import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectDaemon, type DaemonClient } from '../src/daemon/client.js'
import { type Daemon, socketPath, startDaemon } from '../src/daemon/server.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string
let daemon: Daemon | null = null
const clients: DaemonClient[] = []

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-daemon-'))
})

afterEach(() => {
  for (const client of clients) client.close()
  clients.length = 0
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

async function attach(): Promise<DaemonClient> {
  const client = await connectDaemon(socketPath(dir))
  clients.push(client)
  return client
}

function nextMessage(client: DaemonClient, type: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} message`)), timeoutMs)
    client.onMessage((msg) => {
      if (msg.type === type) {
        clearTimeout(timer)
        resolve(msg)
      }
    })
  })
}

describe('daemon', () => {
  it('drives a session over the socket and broadcasts state', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('served result')"))
    daemon = await startDaemon({ cwd: dir, engineId: 'fake' })

    const driver = await attach()
    const hello = await nextMessage(driver, 'hello')
    expect(hello.role).toBe('driver')

    const done = new Promise<void>((resolve) => {
      driver.onMessage((msg) => {
        if (msg.type !== 'state') return
        const items = (msg.state as { items: { role: string; text: string }[] }).items
        if (items.some((i) => i.role === 'assistant' && i.text.includes('served result'))) resolve()
      })
    })
    driver.send({ type: 'input', text: 'do the thing' })
    await done
  })

  it('second attach observes: state flows in, steering is denied, promotion works', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('ok')"))
    daemon = await startDaemon({ cwd: dir, engineId: 'fake' })

    const driver = await attach()
    await nextMessage(driver, 'hello')
    const observer = await attach()
    const observerHello = await nextMessage(observer, 'hello')
    expect(observerHello.role).toBe('observer')
    expect(daemon.clientCount()).toBe(2)

    const denied = nextMessage(observer, 'denied')
    observer.send({ type: 'input', text: 'let me drive' })
    expect(String((await denied).reason)).toContain('observer')

    // Verdict verbs are shared: /decide lands with seat attribution.
    const noted = new Promise<void>((resolve) => {
      observer.onMessage((msg) => {
        if (msg.type !== 'state') return
        const items = (msg.state as { items: { text: string }[] }).items
        if (items.some((i) => i.text.includes('seat 2 (observer): /decide no purple'))) resolve()
      })
    })
    observer.send({ type: 'command', text: '/decide no purple' })
    await noted

    const deniedSteer = nextMessage(observer, 'denied')
    observer.send({ type: 'command', text: '/dev' })
    expect(String((await deniedSteer).reason)).toContain('driver steers')

    const promoted = nextMessage(observer, 'hello')
    driver.close()
    expect((await promoted).role).toBe('driver')
  })

  it('a late attach receives the full transcript immediately', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(fakeEngine("console.log('early work')"))
    daemon = await startDaemon({ cwd: dir, engineId: 'fake' })
    const driver = await attach()
    const turnDone = new Promise<void>((resolve) => {
      driver.onMessage((msg) => {
        if (msg.type !== 'state') return
        const state = msg.state as { items: { role: string; text: string }[]; running: boolean }
        if (!state.running && state.items.some((i) => i.role === 'assistant' && i.text.includes('early work'))) resolve()
      })
    })
    driver.send({ type: 'input', text: 'do early work' })
    await turnDone

    const late = await attach()
    const firstState = new Promise<Record<string, unknown>>((resolve) => {
      late.onMessage((msg) => {
        if (msg.type === 'state') resolve(msg)
      })
    })
    const state = (await firstState).state as { items: { role: string; text: string }[] }
    expect(state.items.some((i) => i.role === 'assistant' && i.text.includes('early work'))).toBe(true)
  })

  it('connectDaemon rejects when nothing listens', async () => {
    await expect(connectDaemon(path.join(dir, 'nothing.sock'), 500)).rejects.toThrow()
  })
})
