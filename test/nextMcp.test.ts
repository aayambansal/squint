import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hasNextMcp, probeNextMcp } from '../src/preview/nextMcp.js'

let server: http.Server | null = null

function serve(handler: (body: Record<string, unknown>, res: http.ServerResponse) => void): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url !== '/_next/mcp') {
        res.writeHead(404).end()
        return
      }
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => handler(raw ? JSON.parse(raw) : {}, res))
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server!.address() as { port: number }
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

afterEach(() => {
  server?.close()
  server = null
})

describe('next mcp probe', () => {
  it('initializes, lists tools, and pulls error-shaped tools (JSON + SSE mixed)', async () => {
    const base = await serve((body, res) => {
      const id = body.id as number
      switch (body.method) {
        case 'initialize':
          res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's1' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { serverInfo: { name: 'next' } } }))
          return
        case 'notifications/initialized':
          res.writeHead(202).end()
          return
        case 'tools/list':
          // SSE-framed response, as the streamable transport allows.
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(
            `event: message\ndata: ${JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { tools: [{ name: 'get_build_errors' }, { name: 'list_routes' }] },
            })}\n\n`,
          )
          return
        case 'tools/call': {
          const name = (body.params as { name: string }).name
          expect(name).toBe('get_build_errors')
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { content: [{ type: 'text', text: 'Module not found: ./missing in app/page.tsx' }] },
            }),
          )
          return
        }
        default:
          res.writeHead(400).end()
      }
    })

    const result = await probeNextMcp(base)
    expect(result.available).toBe(true)
    expect(result.tools).toEqual(['get_build_errors', 'list_routes'])
    expect(result.errors).toEqual(['[get_build_errors] Module not found: ./missing in app/page.tsx'])
  })

  it('drops no-errors prose and reports availability without findings', async () => {
    const base = await serve((body, res) => {
      const id = body.id as number
      if (body.method === 'initialize') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
      } else if (body.method === 'tools/list') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: [{ name: 'get_runtime_errors' }] } }))
      } else if (body.method === 'tools/call') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'No runtime errors.' }] } }))
      } else {
        res.writeHead(202).end()
      }
    })
    const result = await probeNextMcp(base)
    expect(result.available).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns unavailable for dead endpoints and non-MCP servers', async () => {
    const base = await serve((_body, res) => res.writeHead(404).end())
    expect((await probeNextMcp(base)).available).toBe(false)
    expect((await probeNextMcp('http://127.0.0.1:9', 500)).available).toBe(false)
  })

  it('gates on next >= 16 in package.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-next-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.1.0' } }))
    expect(hasNextMcp(dir)).toBe(true)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '^15.3.0' } }))
    expect(hasNextMcp(dir)).toBe(false)
    expect(hasNextMcp(os.tmpdir())).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
