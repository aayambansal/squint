import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Daemon, startDaemon } from '../src/daemon/server.js'
import { loadDecisions } from '../src/session/designLog.js'
import * as registry from '../src/engines/registry.js'
import type { Engine } from '../src/engines/types.js'

let dir: string
let daemon: Daemon | null = null
let hook: http.Server | null = null

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-relay-'))
})

afterEach(() => {
  daemon?.close()
  daemon = null
  hook?.close()
  hook = null
  vi.restoreAllMocks()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the approval relay', () => {
  it('POSTs one-shot URLs on request; hitting approve answers /yes; tokens burn', async () => {
    const posts: Record<string, unknown>[] = []
    let sawPost: (() => void) | null = null
    hook = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        posts.push(JSON.parse(body))
        res.writeHead(200).end()
        sawPost?.()
      })
    })
    const hookPort: number = await new Promise((resolve) => {
      hook!.listen(0, '127.0.0.1', () => resolve((hook!.address() as { port: number }).port))
    })

    let call = 0
    const engine: Engine = {
      id: 'fake',
      name: 'Fake',
      binary: 'node',
      install: 'n/a',
      supportsResume: false,
      buildArgs: () => {
        call++
        if (call === 1) {
          return ['-e', `require('fs').mkdirSync('.squint',{recursive:true});require('fs').writeFileSync('.squint/approval-request.json',JSON.stringify({summary:'ship the neon variant'}));console.log('asked')`]
        }
        return ['-e', "console.log('proceeding neon')"]
      },
    }
    vi.spyOn(registry, 'getEngine').mockReturnValue(engine)

    daemon = await startDaemon({ cwd: dir, engineId: 'fake', approvalWebhook: `http://127.0.0.1:${hookPort}/` })
    expect(daemon.relayUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const posted = new Promise<void>((resolve) => (sawPost = resolve))
    daemon.session.input('restyle the hero')
    await posted

    const post = posts[0]!
    expect(post.summary).toBe('ship the neon variant')
    const approveUrl = String(post.approveUrl)
    expect(approveUrl.startsWith(daemon.relayUrl!)).toBe(true)

    const first = await fetch(approveUrl)
    expect(first.status).toBe(200)
    expect(await first.text()).toContain('approved')

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turn timeout')), 8000)
      daemon!.session.subscribe(() => {
        if (daemon!.session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('proceeding neon'))) {
          clearTimeout(timer)
          resolve()
        }
      })
    })

    expect(loadDecisions(dir).at(-1)?.decision).toContain('approved: ship the neon variant')
    // Both tokens burned on first use.
    expect((await fetch(approveUrl)).status).toBe(404)
    expect((await fetch(String(post.rejectUrl))).status).toBe(404)
  })
})
