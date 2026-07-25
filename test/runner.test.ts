import { describe, expect, it } from 'vitest'
import { runAgent } from '../src/runner/run.js'
import type { AgentEvent, Engine } from '../src/engines/types.js'

/** A fake engine backed by `node -e` so runner behavior is testable for real. */
function fakeEngine(script: string): Engine {
  return {
    id: 'fake',
    name: 'Fake',
    binary: 'node',
    install: 'n/a',
    supportsResume: false,
    buildArgs: () => ['-e', script],
  }
}

describe('runAgent', () => {
  it('streams plain stdout lines as text events and resolves ok', async () => {
    const events: AgentEvent[] = []
    const result = await runAgent(
      fakeEngine("console.log('one'); console.log('two')"),
      { prompt: 'x', cwd: process.cwd() },
      (e) => events.push(e),
    )
    expect(result.ok).toBe(true)
    expect(events.filter((e) => e.type === 'text').map((e: any) => e.text)).toEqual(['one', 'two'])
  })

  it('reports a missing binary with install instructions', async () => {
    const events: AgentEvent[] = []
    const engine: Engine = { ...fakeEngine(''), binary: 'definitely-not-a-real-binary-xyz' }
    const result = await runAgent(engine, { prompt: 'x', cwd: process.cwd() }, (e) => events.push(e))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found on PATH')
  })

  it('synthesizes an error when the process fails without a result', async () => {
    const events: AgentEvent[] = []
    const result = await runAgent(
      fakeEngine("console.error('boom'); process.exit(2)"),
      { prompt: 'x', cwd: process.cwd() },
      (e) => events.push(e),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('exited with code 2')
    expect(result.error).toContain('boom')
  })

  it('kills the child and reports interrupted on abort', { timeout: 10000 }, async () => {
    const events: AgentEvent[] = []
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 300)
    const started = Date.now()
    const result = await runAgent(
      fakeEngine("setInterval(() => console.log('tick'), 100)"),
      { prompt: 'x', cwd: process.cwd() },
      (e) => events.push(e),
      abort.signal,
    )
    expect(Date.now() - started).toBeLessThan(5000)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('interrupted')
    expect(events.some((e) => e.type === 'status' && e.text === 'interrupted')).toBe(true)
  })
})
