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

describe.skipIf(!chrome || !hasWebSocket())('pixelDiffPct (requires Chrome)', () => {
  it('scores identical pages near 0 and different pages near 100', { timeout: 120000, retry: 2 }, async () => {
    const { pixelDiffPct } = await import('../src/preview/cdp.js')
    const { screenshot } = await import('../src/preview/chrome.js')
    const red = path.join(dir, 'red.png')
    const blue = path.join(dir, 'blue.png')
    await screenshot(chrome!, 'data:text/html,<body style="background:%23ff0000">', red, { width: 200, height: 200 })
    await screenshot(chrome!, 'data:text/html,<body style="background:%230000ff">', blue, { width: 200, height: 200 })
    const same = await pixelDiffPct(chrome!, fs.readFileSync(red), fs.readFileSync(red))
    const different = await pixelDiffPct(chrome!, fs.readFileSync(red), fs.readFileSync(blue))
    expect(same).not.toBeNull()
    expect(same!).toBeLessThan(0.5)
    expect(different).not.toBeNull()
    expect(different!).toBeGreaterThan(90)
  })
})

describe.skipIf(!chrome || !hasWebSocket())('cdpCapture (requires Chrome + WebSocket)', () => {
  it('captures screenshots and observes console/page/network errors', { timeout: 120000, retry: 2 }, async () => {
    const page = path.join(dir, 'page.html')
    fs.writeFileSync(
      page,
      `<!doctype html><html><head><title>t</title>
      <style>
        .c1{color:#111}.c2{color:#222}.c3{color:#333}.c4{color:#444}.c5{color:#555}
        .c6{color:#666}.c7{color:#777}.c8{color:#888}.c9{color:#999}.c10{color:#aaa}
        .real-thing{font-weight:bold}
        .card-a{view-transition-name:hero-card}
        .card-b{view-transition-name:hero-card}
        ::view-transition-old(hero-card){animation-duration:.3s}
      </style>
      </head><body style="font-family: Arial, sans-serif"><h1 class="real-thing bg-linear-to-r">squint cdp</h1>
      <h4>skipped levels</h4>
      <img src="definitely-missing.png" />
      <button></button>
      <input type="text" />
      <ul><li>🚀 fast</li><li>✨ shiny</li><li>🔥 hot</li></ul>
      <div class="card-a">a</div><div class="card-b">b</div>
      <script>
        console.error('console-boom');
        setTimeout(() => { throw new Error('uncaught-boom') }, 100);
        // Hand-built fiber chain exercising the same property protocol
        // react-dom uses to stamp host elements in dev builds.
        function App() {}
        function Hero() {}
        const fiberApp = { type: App, return: null };
        const fiberHero = { type: Hero, return: fiberApp };
        const h1 = document.querySelector('h1');
        h1['__reactFiber$squint'] = { type: 'h1', return: fiberHero };
        document.modelContext.provideContext({
          tools: [{ name: 'add-todo', description: 'Adds a todo item', execute: () => {} }],
        });
        navigator.modelContext.registerTool({ name: 'clear-done' });
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

    const slop = result.slop.join('\n')
    expect(slop).toContain('generic font stack: arial')
    expect(slop).toContain('emoji-bulleted')

    const phantoms = result.phantoms.join('\n')
    expect(phantoms).toContain('bg-linear-to-r (on <h1>)')
    expect(phantoms).not.toContain('real-thing')

    expect(result.components).toEqual(['h1 — Hero < App'])
    expect(result.webmcp).toEqual(['add-todo — Adds a todo item', 'clear-done'])

    const vt = result.viewTransitions.join('\n')
    expect(vt).toContain('duplicate view-transition-name "hero-card" on 2 elements')
    expect(vt).toContain('no prefers-reduced-motion')

    const narration = result.narration.join('\n')
    expect(narration).toContain('heading 1: "squint cdp"')
    expect(narration).toContain('button (no accessible name)')
    expect(narration).toContain('textbox (no accessible name)')
  })
})
