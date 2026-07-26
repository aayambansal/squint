import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findChrome } from '../src/preview/chrome.js'
import { hasWebSocket } from '../src/preview/cdp.js'
import { loadFlows, parseFlow, stepExpression } from '../src/preview/flows.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-flows-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('parseFlow', () => {
  it('parses every verb and rejects unknown ones loudly', () => {
    const flow = parseFlow(
      'signup',
      '# happy path\ngoto /signup\nfill #email me@x.com\nclick Sign up\npress Enter\nexpect Check your inbox\nshot done!\n',
    )
    expect(flow?.steps.map((s) => s.kind)).toEqual(['goto', 'fill', 'click', 'press', 'expect', 'shot'])
    expect(flow?.steps[0]).toEqual({ kind: 'goto', route: '/signup' })
    expect(flow?.steps[5]).toEqual({ kind: 'shot', name: 'done-' })
    expect(parseFlow('bad', 'teleport /nowhere')).toBeNull()
    expect(parseFlow('empty', '# only comments\n')).toBeNull()
  })

  it('parses hover, scroll, and wait with validation', () => {
    const flow = parseFlow('rich', 'goto /\nhover Pricing\nscroll bottom\nscroll #faq\nwait 500\nexpect FAQ')
    expect(flow?.steps.map((s) => s.kind)).toEqual(['goto', 'hover', 'scroll', 'scroll', 'wait', 'expect'])
    expect(flow?.steps[4]).toEqual({ kind: 'wait', ms: 500 })
    expect(parseFlow('bad-wait', 'wait forever')).toBeNull()
    expect(parseFlow('too-long', 'wait 99999')).toBeNull()
    expect(stepExpression({ kind: 'hover', target: 'Pricing' })).toContain('mouseover')
    expect(stepExpression({ kind: 'scroll', target: 'bottom' })).toContain('scrollHeight')
    expect(stepExpression({ kind: 'wait', ms: 100 })).toBeNull()
  })

  it('loads .flow files from .squint/flows', () => {
    const flowsDir = path.join(dir, '.squint', 'flows')
    fs.mkdirSync(flowsDir, { recursive: true })
    fs.writeFileSync(path.join(flowsDir, 'a.flow'), 'goto /\nexpect hello\n')
    fs.writeFileSync(path.join(flowsDir, 'broken.flow'), 'teleport x\n')
    const flows = loadFlows(dir)
    expect(flows.map((f) => f.name)).toEqual(['a'])
  })

  it('generates in-page executors for interactive steps only', () => {
    expect(stepExpression({ kind: 'goto', route: '/' })).toBeNull()
    expect(stepExpression({ kind: 'shot', name: 'x' })).toBeNull()
    expect(stepExpression({ kind: 'click', target: 'Sign up' })).toContain('el.click()')
    expect(stepExpression({ kind: 'expect', text: 'hi' })).toContain('innerText')
  })
})

const chrome = findChrome()

describe.skipIf(!chrome || !hasWebSocket())('runFlow (requires Chrome)', () => {
  it('replays click → expect and reports the exact failing step', { timeout: 120000, retry: 2 }, async () => {
    const { runFlow } = await import('../src/preview/cdp.js')
    const page = path.join(dir, 'index.html')
    fs.writeFileSync(
      page,
      `<!doctype html><html><body>
        <button onclick="document.getElementById('m').textContent='Welcome aboard'">Get started</button>
        <div id="m"></div>
      </body></html>`,
    )
    const passing = parseFlow('happy', 'goto /\nclick Get started\nexpect Welcome aboard\nshot end')!
    const result = await runFlow(chrome!, `file://${page}`, passing, dir)
    expect(result.ok).toBe(true)
    expect(result.shots.length).toBe(1)
    expect(fs.statSync(result.shots[0]!).size).toBeGreaterThan(500)

    const failing = parseFlow('sad', 'goto /\nclick Get started\nexpect This text never appears')!
    const failed = await runFlow(chrome!, `file://${page}`, failing, dir)
    expect(failed.ok).toBe(false)
    expect(failed.failedStep).toBe(3)
    expect(failed.detail).toContain('does not show')
  })
})

describe.skipIf(!findChrome())('suggestFlows (requires Chrome)', () => {
  it('drafts a goto/expect/shot flow per route from live headings', { timeout: 120000, retry: 2 }, async () => {
    const http = await import('node:http')
    const pages: Record<string, string> = {
      '/': '<h1>Welcome home</h1>',
      '/pricing': '<h1>Simple pricing</h1>',
    }
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><html lang="en"><head><title>t</title></head><body>${pages[req.url ?? '/'] ?? '<p>404</p>'}</body></html>`)
    })
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
    })
    try {
      fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.squint', 'routes'), '/pricing\n')
      fs.mkdirSync(path.join(dir, '.squint', 'flows'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.squint', 'flows', 'home.flow'), 'goto /\nshot custom\n')

      const { suggestFlows } = await import('../src/preview/flows.js')
      const { created, skipped } = await suggestFlows(dir, `http://127.0.0.1:${port}`, findChrome()!)
      expect(skipped).toEqual(['home'])
      expect(created).toEqual(['pricing'])
      const flow = fs.readFileSync(path.join(dir, '.squint', 'flows', 'pricing.flow'), 'utf8')
      expect(flow).toBe('goto /pricing\nexpect Simple pricing\nshot pricing\n')
    } finally {
      server.close()
    }
  })
})

describe('summarizeSoftNav', () => {
  it('folds entries into one line per transition, ordered, with worst ICP', async () => {
    const { summarizeSoftNav } = await import('../src/preview/cdp.js')
    const lines = summarizeSoftNav([
      { type: 'soft-navigation', navigationId: 'n2', start: 900, value: 0, url: 'http://x/checkout' },
      { type: 'soft-navigation', navigationId: 'n1', start: 100, value: 0, url: 'http://x/products' },
      { type: 'icp', navigationId: 'n1', start: 120, value: 240, url: '' },
      { type: 'icp', navigationId: 'n1', start: 130, value: 410, url: '' },
      { type: 'icp', navigationId: 'n2', start: 910, value: 180, url: '' },
      { type: 'icp', navigationId: '', start: 50, value: 999, url: '' },
    ])
    expect(lines).toEqual(['soft-nav → /products · ICP 410ms', 'soft-nav → /checkout · ICP 180ms'])
  })

  it('reports transitions without ICP plainly and handles empty input', async () => {
    const { summarizeSoftNav } = await import('../src/preview/cdp.js')
    expect(summarizeSoftNav([])).toEqual([])
    expect(
      summarizeSoftNav([{ type: 'soft-navigation', navigationId: 'n1', start: 5, value: 0, url: 'http://x/about' }]),
    ).toEqual(['soft-nav → /about'])
  })
})

describe.skipIf(!findChrome() || !hasWebSocket())('leak pulse (requires Chrome)', () => {
  it('reports detached DOM retained after a journey; clean pages stay silent', { timeout: 120000, retry: 2 }, async () => {
    const http = await import('node:http')
    const leakyPage = `<!doctype html><html lang="en"><head><title>l</title></head><body><h1>Leaky</h1>
      <script>
        window.__retained = [];
        for (let i = 0; i < 15; i++) {
          const el = document.createElement('div');
          el.className = 'card';
          el.append(document.createElement('span'));
          document.body.append(el);
          el.remove();
          window.__retained.push(el);
        }
      </script></body></html>`
    const cleanPage = '<!doctype html><html lang="en"><head><title>c</title></head><body><h1>Clean</h1></body></html>'
    let page = leakyPage
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
      res.end(page)
    })
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port))
    })
    try {
      const { runFlow } = await import('../src/preview/cdp.js')
      const { parseFlow } = await import('../src/preview/flows.js')
      const flow = parseFlow('smoke', 'goto /\nexpect Leaky')!
      const leaky = await runFlow(findChrome()!, `http://127.0.0.1:${port}`, flow, dir)
      expect(leaky.ok).toBe(true)
      expect(leaky.leaks.length).toBe(1)
      expect(leaky.leaks[0]).toContain('detached DOM subtree(s) retained')

      page = cleanPage
      const clean = await runFlow(findChrome()!, `http://127.0.0.1:${port}`, parseFlow('smoke2', 'goto /\nexpect Clean')!, dir)
      expect(clean.ok).toBe(true)
      expect(clean.leaks).toEqual([])
    } finally {
      server.close()
    }
  })
})

describe('summarizeSoftNav edge cases', () => {
  it('multiple soft-navs sharing a navigationId keep the latest url and worst ICP', async () => {
    const { summarizeSoftNav } = await import('../src/preview/cdp.js')
    const lines = summarizeSoftNav([
      { type: 'soft-navigation', navigationId: 'n1', start: 100, value: 0, url: 'http://x/a' },
      { type: 'soft-navigation', navigationId: 'n1', start: 100, value: 0, url: 'http://x/a?tab=2' },
      { type: 'icp', navigationId: 'n1', start: 150, value: 90, url: '' },
    ])
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('ICP 90ms')
  })
})

describe('budget verb', () => {
  it('parses budget icp <ms> and rejects malformed budgets', () => {
    const flow = parseFlow('perf', 'goto /\nbudget icp 400\nexpect Ready')
    expect(flow?.steps).toContainEqual({ kind: 'budget', metric: 'icp', ms: 400 })
    expect(parseFlow('bad', 'budget icp fast')).toBeNull()
    expect(parseFlow('bad2', 'budget lcp 400')).toBeNull()
  })

  it('budget steps produce no in-page expression', async () => {
    expect(stepExpression({ kind: 'budget', metric: 'icp', ms: 400 })).toBeNull()
  })
})

describe('summarizeShifts', () => {
  it('folds layout-shift entries into a per-element ledger over the 0.05 threshold', async () => {
    const { summarizeShifts } = await import('../src/preview/cdp.js')
    const lines = summarizeShifts([
      { value: 0.06, label: 'img.hero' },
      { value: 0.04, label: 'div.banner' },
      { value: 0.02, label: 'img.hero' },
    ])
    expect(lines[0]).toBe('layout shift: CLS 0.120 over the journey')
    expect(lines.some((l) => l.includes('img.hero shifted (0.080)'))).toBe(true)
    expect(summarizeShifts([{ value: 0.01, label: 'p' }])).toEqual([])
  })
})
