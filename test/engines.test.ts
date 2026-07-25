import { describe, expect, it } from 'vitest'
import { amp } from '../src/engines/amp.js'
import { cursor } from '../src/engines/cursor.js'
import { opencode } from '../src/engines/opencode.js'
import { engines, getEngine } from '../src/engines/registry.js'

describe('registry', () => {
  it('exposes all eight engines with unique ids', () => {
    const ids = engines.map((e) => e.id)
    expect(ids).toEqual(['claude', 'codex', 'gemini', 'opencode', 'amp', 'cursor', 'copilot', 'aider'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('throws a helpful error for unknown engines', () => {
    expect(() => getEngine('nope')).toThrow(/Unknown engine "nope"/)
  })
})

describe('amp', () => {
  it('runs execute mode fresh and threads continue on resume', () => {
    expect(amp.buildArgs({ prompt: 'hi', cwd: '/tmp' })).toEqual(['-x', 'hi', '--stream-json'])
    expect(amp.buildArgs({ prompt: 'more', cwd: '/tmp', sessionId: 'T-1' })).toEqual([
      'threads',
      'continue',
      '--execute',
      'more',
      '--stream-json',
    ])
  })

  it('parses the shared claude wire protocol', () => {
    const parse = amp.createParser!()
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'From amp.' }] },
    })
    expect(parse(line)).toEqual([{ type: 'text', text: 'From amp.' }])
  })
})

describe('cursor', () => {
  it('builds a print-mode stream-json invocation with resume flag', () => {
    const args = cursor.buildArgs({ prompt: 'go', cwd: '/tmp', model: 'gpt-5', sessionId: 'chat-7' })
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    expect(args).toContain('--model')
    expect(args).toContain('--resume=chat-7')
  })

  it('declares an alternate binary name', () => {
    expect(cursor.altBinaries).toContain('agent')
  })
})

describe('opencode parser', () => {
  it('captures session id from events and reports it on step_finish stop', () => {
    const parse = opencode.createParser!()
    expect(
      parse(JSON.stringify({ type: 'text', sessionID: 'ses_1', part: { text: 'Hello from opencode.' } })),
    ).toEqual([{ type: 'text', text: 'Hello from opencode.' }])
    expect(
      parse(
        JSON.stringify({
          type: 'tool_use',
          sessionID: 'ses_1',
          part: { tool: 'bash', state: { status: 'completed', input: { command: 'ls' } } },
        }),
      ),
    ).toEqual([{ type: 'tool', name: 'bash', detail: 'ls' }])
    expect(parse(JSON.stringify({ type: 'step_finish', sessionID: 'ses_1', part: { reason: 'stop' } }))).toEqual([
      { type: 'result', ok: true, sessionId: 'ses_1' },
    ])
  })

  it('builds resume args with --session', () => {
    const args = opencode.buildArgs({ prompt: 'next', cwd: '/tmp', sessionId: 'ses_2' })
    expect(args).toContain('--session')
    expect(args).toContain('ses_2')
  })
})
