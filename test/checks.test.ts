import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadChecks } from '../src/preview/checks.js'
import { cdpCapture, hasWebSocket } from '../src/preview/cdp.js'
import { findChrome } from '../src/preview/chrome.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-checks-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('loadChecks', () => {
  it('loads .squint/checks/*.js sorted, skipping empty and oversized files', () => {
    const checksDir = path.join(dir, '.squint', 'checks')
    fs.mkdirSync(checksDir, { recursive: true })
    fs.writeFileSync(path.join(checksDir, 'b-nav.js'), '[]')
    fs.writeFileSync(path.join(checksDir, 'a-hero.js'), '["x"]')
    fs.writeFileSync(path.join(checksDir, 'empty.js'), '  ')
    fs.writeFileSync(path.join(checksDir, 'huge.js'), 'x'.repeat(20_000))
    fs.writeFileSync(path.join(checksDir, 'notes.md'), 'not a check')

    const checks = loadChecks(dir)
    expect(checks.map((c) => c.name)).toEqual(['a-hero', 'b-nav'])
  })

  it('honors the squint-trigger pragma: audit-only checks skip per-turn probes', () => {
    const checksDir = path.join(dir, '.squint', 'checks')
    fs.mkdirSync(checksDir, { recursive: true })
    fs.writeFileSync(path.join(checksDir, 'always.js'), '[]')
    fs.writeFileSync(path.join(checksDir, 'deep.js'), '// squint-trigger: audit\n[]')

    expect(loadChecks(dir, 'audit').map((c) => `${c.name}:${c.trigger}`)).toEqual(['always:turn', 'deep:audit'])
    expect(loadChecks(dir, 'turn').map((c) => c.name)).toEqual(['always'])
  })

  it('returns empty without a checks directory', () => {
    expect(loadChecks(dir)).toEqual([])
  })
})

const chrome = findChrome()

describe.skipIf(!chrome || !hasWebSocket())('checks in the probe (requires Chrome)', () => {
  it('runs checks in the page: pass, fail, and throw', { timeout: 120000, retry: 2 }, async () => {
    const page = path.join(dir, 'page.html')
    fs.writeFileSync(page, '<!doctype html><html lang="en"><head><title>t</title></head><body><h1>hello</h1></body></html>')
    const checks = [
      { name: 'has-h1', source: '(() => document.querySelector("h1") ? [] : ["no h1 on the page"])()' },
      { name: 'has-cta', source: '(() => document.querySelector(".cta") ? [] : ["cta button missing"])()' },
      { name: 'broken', source: 'definitelyNotDefined()' },
    ]
    const result = await cdpCapture(chrome!, `file://${page}`, dir, [], 500, false, checks)
    expect(result.checkFailures.some((f) => f === 'has-cta: cta button missing')).toBe(true)
    expect(result.checkFailures.some((f) => f.startsWith('broken: threw'))).toBe(true)
    expect(result.checkFailures.some((f) => f.startsWith('has-h1'))).toBe(false)
  })
})

describe('interval checks', () => {
  it('parses interval pragmas with custom seconds and keeps them out of other contexts', () => {
    const checksDir = path.join(dir, '.squint', 'checks')
    fs.mkdirSync(checksDir, { recursive: true })
    fs.writeFileSync(path.join(checksDir, 'uptime.js'), '// squint-trigger: interval:45\n[]')
    fs.writeFileSync(path.join(checksDir, 'default-interval.js'), '// squint-trigger: interval\n[]')
    fs.writeFileSync(path.join(checksDir, 'everyturn.js'), '[]')

    const interval = loadChecks(dir, 'interval')
    expect(interval.map((c) => `${c.name}:${c.intervalSec}`)).toEqual(['default-interval:300', 'uptime:45'])
    expect(loadChecks(dir, 'turn').map((c) => c.name)).toEqual(['everyturn'])
    expect(loadChecks(dir, 'audit').map((c) => c.name)).toEqual(['everyturn'])
  })
})

describe.skipIf(!chrome || !hasWebSocket())('runIntervalSweep (requires Chrome)', () => {
  it('runs due interval checks against a live URL and honors the clock', { timeout: 120000, retry: 2 }, async () => {
    const http = await import('node:http')
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><html lang="en"><head><title>t</title></head><body><h1>up</h1></body></html>')
    })
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
    })
    try {
      const checksDir = path.join(dir, '.squint', 'checks')
      fs.mkdirSync(checksDir, { recursive: true })
      fs.writeFileSync(
        path.join(checksDir, 'cta-alive.js'),
        '// squint-trigger: interval:60\n(() => document.querySelector(".cta") ? [] : ["cta missing from the live page"])()',
      )
      const { runIntervalSweep } = await import('../src/preview/checks.js')
      const lastRun = new Map<string, number>()
      const failures = await runIntervalSweep(dir, `http://127.0.0.1:${port}/`, lastRun)
      expect(failures).toEqual(['cta-alive: cta missing from the live page'])
      // Immediately due again? No — the clock was stamped.
      expect(await runIntervalSweep(dir, `http://127.0.0.1:${port}/`, lastRun)).toEqual([])
    } finally {
      server.close()
    }
  })
})
