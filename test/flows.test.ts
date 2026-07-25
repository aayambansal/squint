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
