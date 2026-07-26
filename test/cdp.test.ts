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
      <button class="bad-focus" style="outline:none">go</button>
      <ul><li>🚀 fast</li><li>✨ shiny</li><li>🔥 hot</li></ul>
      <div class="card-a">a</div><div class="card-b">b</div>
      <button class="tight" style="width:110px;overflow:hidden;white-space:nowrap;display:block">Save all changes</button>
      <p class="hardleft" style="text-align:left">This paragraph pins itself to the left edge no matter the reading direction.</p>
      <p class="fluid">This paragraph inherits direction like a well-behaved block of text should.</p>
      <style>@media (forced-colors: active) { .fc-trap { color: CanvasText; background: CanvasText; } }</style>
      <button class="fc-trap">Trapped text</button>
      <nav style="height:80px">persistent navigation</nav>
      <label><input type="checkbox" checked /> Subscribe to marketing updates from our partners</label>
      <label><input type="checkbox" checked /> Remember my theme preference</label>
      <div class="cookie-banner">
        <button class="cta-accept" style="font-size:18px;padding:14px 40px">Accept all</button>
        <button class="cta-decline" style="font-size:11px;padding:2px 6px">Decline</button>
      </div>
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
    expect(findings).toContain('keyboard: focus invisible on <button.bad-focus>')
    expect(findings).not.toContain('focus invisible on <input')
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

    expect(result.a11y.join('\n')).toContain('forced-colors: <button.fc-trap> text matches its background')
    expect(result.slop.join('\n')).toContain('print: <nav> still renders in print output')

    const deception = result.slop.filter((f) => f.startsWith('deceptive:')).join('\n')
    expect(deception).toContain('preselected consent checkbox')
    expect(deception).toContain('Subscribe to marketing')
    expect(deception).not.toContain('Remember my theme')
    expect(deception).toContain('<button.cta-decline> is visually buried next to <button.cta-accept>')

    const locale = result.locale.join('\n')
    expect(locale).toContain('<button.tight> clips at +40% text expansion')
    expect(locale).toContain('<p.hardleft> hardcodes text-align:left')
    expect(locale).not.toContain('p.fluid')

    const narration = result.narration.join('\n')
    expect(narration).toContain('heading 1: "squint cdp"')
    expect(narration).toContain('button (no accessible name)')
    expect(narration).toContain('textbox (no accessible name)')
  })
})

describe.skipIf(!chrome || !hasWebSocket())('LoAF jank attribution (requires Chrome)', () => {
  it('names the function behind a long frame on an http origin', { timeout: 120000, retry: 2 }, async () => {
    const http = await import('node:http')
    const html = `<!doctype html><html lang="en"><head><title>j</title></head><body><h1>jank</h1>
      <script>
        function burnMainThread() { const start = performance.now(); while (performance.now() - start < 90) {} }
        requestAnimationFrame(burnMainThread);
      </script></body></html>`
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html)
    })
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
    })
    try {
      const result = await cdpCapture(chrome!, `http://127.0.0.1:${port}/`, dir, [], 1500, false)
      expect(result.jank.some((j) => /\d+ms frame — burnMainThread/.test(j))).toBe(true)
    } finally {
      server.close()
    }
  })
})

describe.skipIf(!chrome || !hasWebSocket())('attributed pulse diff (requires Chrome)', () => {
  it('names the element behind a changed region', { timeout: 120000, retry: 2 }, async () => {
    const http = await import('node:http')
    const page = (navBg: string) => `<!doctype html><html lang="en"><head><title>a</title>
      <style>body{margin:0}nav{height:120px;background:${navBg}}main{height:600px;background:#fff}</style>
      </head><body><nav class="top-nav">menu</nav><main>content</main>
      <script>
        function Shell() {}
        const nav = document.querySelector('nav');
        nav['__reactFiber$squint'] = { type: 'nav', return: { type: Shell, return: null } };
      </script></body></html>`
    let bg = '#112233'
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
      res.end(page(bg))
    })
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
    })
    const url = `http://127.0.0.1:${port}/`
    try {
      const before = await cdpCapture(chrome!, url, dir, [{ name: 'pulse', width: 1280, height: 800 }], 500, false)
      const beforePng = fs.readFileSync(before.shots[0]!.path)
      bg = '#ff8800'
      const after = await cdpCapture(chrome!, url, dir, [{ name: 'pulse', width: 1280, height: 800 }], 500, false)
      const { pixelDiffAttributed } = await import('../src/preview/cdp.js')
      const triptych = path.join(dir, 'triptych.png')
      const diff = await pixelDiffAttributed(chrome!, beforePng, fs.readFileSync(after.shots[0]!.path), url, triptych)
      expect(diff).not.toBeNull()
      expect(diff!.pct).toBeGreaterThan(1)
      expect(diff!.sentences.some((s) => s.includes('<nav.top-nav>') && s.includes('(Shell)') && s.includes('changed'))).toBe(true)
      expect(diff!.triptychPath).toBe(triptych)
      expect(fs.statSync(triptych).size).toBeGreaterThan(2000)
    } finally {
      server.close()
    }
  })
})

describe.skipIf(!chrome || !hasWebSocket())('APCA contrast in the slop sweep (requires Chrome)', () => {
  it('flags foggy body text and passes strong text', { timeout: 120000, retry: 2 }, async () => {
    const page = path.join(dir, 'apca.html')
    fs.writeFileSync(
      page,
      `<!doctype html><html lang="en"><head><title>c</title></head>
      <body style="background:#fafafa">
      <p style="color:#b8b8b8;font-size:16px">This long paragraph of body copy is set in a light gray that reads as fog on the off-white background of the page.</p>
      <p style="color:#1a1a1a;font-size:16px">This long paragraph of body copy is set in a properly dark ink that clears the APCA bar without any strain at all.</p>
      </body></html>`,
    )
    const result = await cdpCapture(chrome!, `file://${page}`, dir, [], 500, true)
    const apca = result.slop.filter((s) => s.includes('APCA'))
    expect(apca.length).toBe(1)
    expect(apca[0]).toContain('fog, not elegance')
  })
})
