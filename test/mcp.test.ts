import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMcpServer } from '../src/mcp/server.js'

let dir: string
let input: PassThrough
let output: PassThrough

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-mcp-'))
  input = new PassThrough()
  output = new PassThrough()
})

afterEach(() => {
  input.end()
  fs.rmSync(dir, { recursive: true, force: true })
})

function rpc(msg: Record<string, unknown>): void {
  input.write(`${JSON.stringify(msg)}\n`)
}

function nextResponse(timeoutMs = 8000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no response')), timeoutMs)
    let buffer = ''
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString()
      const idx = buffer.indexOf('\n')
      if (idx >= 0) {
        clearTimeout(timer)
        output.off('data', onData)
        resolve(JSON.parse(buffer.slice(0, idx)))
      }
    }
    output.on('data', onData)
  })
}

describe('squint mcp', () => {
  it('initializes, lists the gate tools, and runs squint_context end to end', async () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), 'gone.ts\n')
    runMcpServer(dir, input, output)

    rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    const init = await nextResponse()
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('squint')

    rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const list = await nextResponse()
    const tools = (list.result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(tools).toEqual(['squint_check', 'squint_shot', 'squint_flows', 'squint_flow_suggest', 'squint_receipt_verify', 'squint_context'])

    rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'squint_context', arguments: {} } })
    const call = await nextResponse()
    const text = (call.result as { content: { text: string }[] }).content[0]!.text
    expect(text).toContain('always-on total')
    expect(text).toContain('stale lock: gone.ts')
  })

  it('squint_check runs real gates and reports the failure output', async () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', scripts: { typecheck: 'node -e "console.error(\'TS9999: fake failure\'); process.exit(1)"' } }),
    )
    runMcpServer(dir, input, output)
    rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'squint_check', arguments: {} } })
    const call = await nextResponse(30000)
    const text = (call.result as { content: { text: string }[] }).content[0]!.text
    expect(text).toContain('✗')
    expect(text).toContain('TS9999: fake failure')
  }, 40000)

  it('squint_receipt_verify vouches for intact receipts and calls out edits', async () => {
    const { writeReceipt } = await import('../src/quality/receipts.js')
    const file = writeReceipt(dir, { ok: true, gates: [] })
    runMcpServer(dir, input, output)

    rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'squint_receipt_verify', arguments: { path: file } } })
    const good = await nextResponse()
    expect((good.result as { content: { text: string }[] }).content[0]!.text).toContain('digest intact')

    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'))
    receipt.report.ok = false
    fs.writeFileSync(file, JSON.stringify(receipt))
    rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'squint_receipt_verify', arguments: { path: file } } })
    const bad = await nextResponse()
    expect((bad.result as { content: { text: string }[] }).content[0]!.text).toContain('DIGEST MISMATCH')
  })

  it('rejects unknown tools and methods with JSON-RPC errors', async () => {
    runMcpServer(dir, input, output)
    rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope', arguments: {} } })
    const bad = await nextResponse()
    expect((bad.error as { code: number }).code).toBe(-32602)

    rpc({ jsonrpc: '2.0', id: 2, method: 'resources/list' })
    const missing = await nextResponse()
    expect((missing.error as { code: number }).code).toBe(-32601)
  })
})
