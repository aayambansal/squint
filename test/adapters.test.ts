import { describe, expect, it } from 'vitest'
import { amp } from '../src/engines/amp.js'
import { copilot } from '../src/engines/copilot.js'
import { cursor } from '../src/engines/cursor.js'
import { opencode } from '../src/engines/opencode.js'

/** Fixture lines mirror real CLI output shapes, one dialect per suite. */
describe('opencode parser', () => {
  it('parses the step/part JSONL dialect end to end', () => {
    const parse = opencode.createParser!()
    expect(parse(JSON.stringify({ type: 'step_start', sessionID: 'ses_9' }))).toEqual([])
    expect(parse(JSON.stringify({ type: 'reasoning', part: { text: 'thinking about it' } }))).toEqual([
      { type: 'thinking', text: 'thinking about it' },
    ])
    expect(
      parse(
        JSON.stringify({
          type: 'tool_use',
          part: { tool: 'bash', state: { status: 'running', input: { command: 'npm run dev' } } },
        }),
      ),
    ).toEqual([{ type: 'tool', name: 'bash', detail: 'npm run dev' }])
    // pending status stays silent — one emission per call
    expect(
      parse(JSON.stringify({ type: 'tool_use', part: { tool: 'edit', state: { status: 'pending', input: {} } } })),
    ).toEqual([])
    expect(parse(JSON.stringify({ type: 'text', part: { text: 'All done.' } }))).toEqual([
      { type: 'text', text: 'All done.' },
    ])
    expect(parse(JSON.stringify({ type: 'step_finish', part: { reason: 'stop' } }))).toEqual([
      { type: 'result', ok: true, sessionId: 'ses_9' },
    ])
  })

  it('surfaces errors and treats non-JSON as text', () => {
    const parse = opencode.createParser!()
    expect(parse(JSON.stringify({ type: 'error', message: 'model refused' }))).toEqual([
      { type: 'error', text: 'model refused' },
    ])
    expect(parse('plain stderr-ish line')).toEqual([{ type: 'text', text: 'plain stderr-ish line' }])
  })
})

describe('amp / cursor (Claude wire dialect)', () => {
  const RESULT = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 'T-1' })
  const TEXT = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'shipped the header' }] },
  })

  it('amp parses assistant text and results through the shared parser', () => {
    const parse = amp.createParser!()
    const textEvents = parse(TEXT)
    expect(textEvents.some((e) => e.type === 'text' && e.text === 'shipped the header')).toBe(true)
    const resultEvents = parse(RESULT)
    expect(resultEvents.some((e) => e.type === 'result' && e.ok && e.sessionId === 'T-1')).toBe(true)
  })

  it('cursor parses the same dialect and maps modes to flags', () => {
    const parse = cursor.createParser!()
    expect(parse(TEXT).some((e) => e.type === 'text')).toBe(true)

    const base = { prompt: 'x', cwd: '/tmp' }
    expect(cursor.buildArgs({ ...base, mode: 'plan' })).toContain('plan')
    expect(cursor.buildArgs({ ...base, mode: 'safe' })).toContain('--force')
    expect(cursor.buildArgs({ ...base, sessionId: 'abc' })).toContain('--resume=abc')
  })

  it('amp routes resume through threads continue and gates the blunt dial', () => {
    const base = { prompt: 'x', cwd: '/tmp' }
    expect(amp.buildArgs({ ...base, sessionId: 't' }).slice(0, 2)).toEqual(['threads', 'continue'])
    expect(amp.buildArgs({ ...base, mode: 'yolo' })).toContain('--dangerously-allow-all')
    expect(amp.buildArgs({ ...base, mode: 'safe' })).not.toContain('--dangerously-allow-all')
  })
})

describe('copilot (plain-text backend)', () => {
  it('maps modes to the only dial it has', () => {
    const base = { prompt: 'x', cwd: '/tmp' }
    expect(copilot.buildArgs({ ...base, mode: 'plan' })).not.toContain('--allow-all-tools')
    expect(copilot.buildArgs({ ...base, mode: 'safe' })).toContain('--allow-all-tools')
    expect(copilot.createParser).toBeUndefined()
  })
})
