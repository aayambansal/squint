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

    const review = buildReviewPrompt([{ name: 'desktop', path: '/x/d.png' }], undefined, report, [
      'img missing alt: hero.png',
    ])
    expect(review).toContain('Runtime errors observed')
    expect(review).toContain('TypeError: x is not a function')
    expect(review).toContain('Accessibility sweep findings')
    expect(review).toContain('img missing alt: hero.png')
  })
})

const chrome = findChrome()

describe.skipIf(!chrome || !hasWebSocket())('cdpCapture (requires Chrome + WebSocket)', () => {
  it('captures screenshots and observes console/page/network errors', { timeout: 120000, retry: 2 }, async () => {
    const page = path.join(dir, 'page.html')
    fs.writeFileSync(
      page,
      `<!doctype html><html><head><title>t</title></head><body><h1>squint cdp</h1>
      <h4>skipped levels</h4>
      <img src="definitely-missing.png" />
      <button></button>
      <input type="text" />
      <script>
        console.error('console-boom');
        setTimeout(() => { throw new Error('uncaught-boom') }, 100);
      </script>
      </body></html>`,
    )
    const result = await cdpCapture(
      chrome!,
      `file://${page}`,
      dir,
      [
        { name: 'mobile', width: 390, height: 844 },
        { name: 'desktop', width: 1280, height: 800 },
      ],
      2500,
      true,
    )

    expect(result.shots.map((s) => s.name)).toEqual(['mobile', 'desktop'])
    for (const shot of result.shots) {
      expect(fs.statSync(shot.path).size).toBeGreaterThan(500)
    }
    expect(result.report.consoleErrors.join(' ')).toContain('console-boom')
    expect(result.report.pageErrors.join(' ')).toContain('uncaught-boom')
    expect(result.report.failedRequests.join(' ')).toContain('definitely-missing.png')

    const findings = result.a11y.join('\n')
    expect(findings).toContain('missing lang')
    expect(findings).toContain('img missing alt')
    expect(findings).toContain('button without accessible name')
    expect(findings).toContain('form control without label')
    expect(findings).toContain('heading order jumps h1 → h4')
  })
})
