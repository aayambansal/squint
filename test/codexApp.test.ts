import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { codexApp } from '../src/engines/codexApp.js'
import { Session } from '../src/session/engine.js'
import * as registry from '../src/engines/registry.js'

let dir: string

const FAKE_CODEX = `#!/usr/bin/env node
// Enough app-server to prove the driver: initialize → thread → turn.
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
let buf = ''
process.stdin.on('data', (c) => {
  buf += c.toString()
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { serverInfo: { name: 'fake' } } })
    else if (msg.method === 'thread/start') send({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: 't-77' } } })
    else if (msg.method === 'thread/resume') send({ jsonrpc: '2.0', id: msg.id, result: { threadId: msg.params.threadId } })
    else if (msg.method === 'turn/start') {
      const resumed = msg.params.threadId
      send({ jsonrpc: '2.0', method: 'turn/started', params: {} })
      send({ jsonrpc: '2.0', method: 'item/started', params: { item: { type: 'commandExecution', command: 'npm test' } } })
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { delta: 'hello from ' } })
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { delta: resumed } })
      send({ jsonrpc: '2.0', method: 'item/completed', params: { item: { type: 'agentMessage', text: 'hello from ' + resumed } } })
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { turn: { status: 'completed' } } })
    }
  }
})
`

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-codexapp-'))
  const bin = path.join(dir, 'fake-codex')
  fs.writeFileSync(bin, FAKE_CODEX, { mode: 0o755 })
  process.env.SQUINT_CODEX_BIN = bin
})

afterEach(() => {
  delete process.env.SQUINT_CODEX_BIN
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

describe('codex app-server adapter', () => {
  it('drives a turn through the driver: stream, tool, result, resume', async () => {
    vi.spyOn(registry, 'getEngine').mockReturnValue(codexApp)
    const session = new Session({ cwd: dir, engineId: 'codex-app' })

    session.input('first ask')
    await waitFor(session, () =>
      session.getState().items.some((i) => i.role === 'assistant' && i.text === 'hello from t-77'),
    )
    expect(session.getState().items.some((i) => i.role === 'tool' && i.text.includes('npm test'))).toBe(true)

    // Second turn resumes the stored thread id through thread/resume.
    session.input('second ask')
    await waitFor(session, () => session.getState().totals.turns === 2)
    const replies = session.getState().items.filter((i) => i.role === 'assistant' && i.text === 'hello from t-77')
    expect(replies.length).toBe(2)
  })

  it('maps modes to sandbox levels in the driver payload', () => {
    const payload = (mode: 'plan' | 'safe' | 'yolo') =>
      JSON.parse(codexApp.buildArgs({ prompt: 'x', cwd: '/tmp', mode })[2]!)
    expect(payload('plan').sandbox).toBe('read-only')
    expect(payload('safe').sandbox).toBe('workspace-write')
    expect(payload('yolo').sandbox).toBe('danger-full-access')
  })
})
