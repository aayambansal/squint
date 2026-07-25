import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cdpCapture, hasWebSocket } from '../src/preview/cdp.js'
import { findChrome } from '../src/preview/chrome.js'
import { buildReviewPrompt, buildRuntimeFixPrompt, runtimeSummary } from '../src/preview/preview.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-cdp-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runtimeSummary / prompts', () => {
  const report = {
    consoleErrors: ['boom happened'],
    pageErrors: ['TypeError: x is not a function'],
    failedRequests: ['404 http://localhost/missing.js'],
  }

  it('summarizes counts and builds fix/review prompts with the details', () => {
    expect(runtimeSummary(report)).toBe('1 page error(s) · 1 console error(s) · 1 failed request(s)')
    expect(runtimeSummary({ consoleErrors: [], pageErrors: [], failedRequests: [] })).toBeNull()

    const fix = buildRuntimeFixPrompt(report)
    expect(fix).toContain('boom happened')
    expect(fix).toContain('404 http://localhost/missing.js')

    const review = buildReviewPrompt([{ name: 'desktop', path: '/x/d.png' }], undefined, report)
    expect(review).toContain('Runtime errors observed')
    expect(review).toContain('TypeError: x is not a function')
  })
})

const chrome = findChrome()

describe.skipIf(!chrome || !hasWebSocket())('cdpCapture (requires Chrome + WebSocket)', () => {
  it('captures screenshots and observes console/page/network errors', { timeout: 60000 }, async () => {
    const page = path.join(dir, 'page.html')
    fs.writeFileSync(
      page,
      `<!doctype html><html><body><h1>squint cdp</h1>
      <img src="definitely-missing.png" />
      <script>
        console.error('console-boom');
        setTimeout(() => { throw new Error('uncaught-boom') }, 100);
      </script>
      </body></html>`,
    )
    const result = await cdpCapture(chrome!, `file://${page}`, dir, [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'desktop', width: 1280, height: 800 },
    ])

    expect(result.shots.map((s) => s.name)).toEqual(['mobile', 'desktop'])
    for (const shot of result.shots) {
      expect(fs.statSync(shot.path).size).toBeGreaterThan(500)
    }
    expect(result.report.consoleErrors.join(' ')).toContain('console-boom')
    expect(result.report.pageErrors.join(' ')).toContain('uncaught-boom')
    expect(result.report.failedRequests.join(' ')).toContain('definitely-missing.png')
  })
})
