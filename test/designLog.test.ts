import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendDecision, decisionsSection, loadDecisions } from '../src/session/designLog.js'
import { enrich } from '../src/prompt/skills.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-ledger-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('design ledger', () => {
  it('appends and reloads decisions, skipping corrupt lines', () => {
    appendDecision(dir, { decision: 'radius locked at 4px', source: 'decide' })
    appendDecision(dir, { decision: 'chose the terminal direction', source: 'variant', screenshot: 'x.png' })
    fs.appendFileSync(path.join(dir, '.squint', 'design-log.jsonl'), 'not json\n')
    appendDecision(dir, { decision: 'rejected the gradient hero', source: 'restore' })

    const decisions = loadDecisions(dir)
    expect(decisions.map((d) => d.decision)).toEqual([
      'radius locked at 4px',
      'chose the terminal direction',
      'rejected the gradient hero',
    ])
  })

  it('caps at the most recent entries', () => {
    for (let i = 0; i < 12; i++) appendDecision(dir, { decision: `decision ${i}`, source: 'decide' })
    const decisions = loadDecisions(dir, 8)
    expect(decisions.length).toBe(8)
    expect(decisions[0]?.decision).toBe('decision 4')
  })

  it('injects standing decisions into every enriched ask', () => {
    appendDecision(dir, { decision: 'no purple, ever', source: 'decide' })
    const enriched = enrich(dir, 'restyle the hero')
    expect(enriched.sections).toContain('Design decisions on record')
    expect(enriched.sections).toContain('no purple, ever (decide, today)')
    expect(enriched.sections).toContain('Do not silently undo them')

    expect(decisionsSection(os.tmpdir())).toBe('')
  })
})

describe('/distill', () => {
  it('sends the ledger to the engine with the enforcement contract', async () => {
    const { Session } = await import('../src/session/engine.js')
    const registry = await import('../src/engines/registry.js')
    const { vi } = await import('vitest')
    appendDecision(dir, { decision: 'no purple, ever', source: 'decide' })
    appendDecision(dir, { decision: 'rejected the gradient hero', source: 'restore' })
    appendDecision(dir, { decision: 'approved: split hero layout', source: 'approval' })

    const seen: string[] = []
    vi.spyOn(registry, 'getEngine').mockReturnValue({
      id: 'fake',
      name: 'Fake',
      binary: 'node',
      install: 'n/a',
      supportsResume: false,
      buildArgs: (opts) => {
        seen.push(opts.prompt)
        return ['-e', "console.log('distilled')"]
      },
    })
    const session = new Session({ cwd: dir, engineId: 'fake' })
    session.command('/distill')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 8000)
      session.subscribe(() => {
        if (session.getState().items.some((i) => i.role === 'assistant' && i.text.includes('distilled'))) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    const prompt = seen[0] ?? ''
    expect(prompt).toContain('[restore] rejected the gradient hero')
    expect(prompt).toContain('.squint/rules.md')
    expect(prompt).toContain('.squint/checks/')
    vi.restoreAllMocks()
  })

  it('refuses with a thin ledger', async () => {
    const { Session } = await import('../src/session/engine.js')
    const session = new Session({ cwd: dir, engineId: 'claude' })
    session.command('/distill')
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 8000)
      session.subscribe(() => {
        if (session.getState().items.some((i) => i.text.includes('distillation needs a few more'))) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  })
})
