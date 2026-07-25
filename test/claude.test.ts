import { describe, expect, it } from 'vitest'
import { claude } from '../src/engines/claude.js'

describe('claude.buildArgs', () => {
  it('builds a headless stream-json invocation with partial messages', () => {
    const args = claude.buildArgs({ prompt: 'build a navbar', cwd: '/tmp' })
    expect(args).toEqual([
      '-p',
      'build a navbar',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
    ])
  })

  it('adds model and resume when provided', () => {
    const args = claude.buildArgs({
      prompt: 'p',
      cwd: '/tmp',
      model: 'claude-sonnet-5',
      sessionId: 'abc-123',
    })
    expect(args).toContain('--model')
    expect(args).toContain('claude-sonnet-5')
    expect(args).toContain('--resume')
    expect(args).toContain('abc-123')
  })
})

describe('claude parser', () => {
  it('normalizes assistant text blocks', () => {
    const parse = claude.createParser!()
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Working on it.' }] },
    })
    expect(parse(line)).toEqual([{ type: 'text', text: 'Working on it.' }])
  })

  it('streams text deltas and flags the final block as streamed', () => {
    const parse = claude.createParser!()
    const delta = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
    })
    expect(parse(delta)).toEqual([{ type: 'delta', text: 'Hel' }])

    const full = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello.' }] },
    })
    expect(parse(full)).toEqual([{ type: 'text', text: 'Hello.', streamed: true }])

    // Next block without deltas is not flagged.
    expect(parse(full)).toEqual([{ type: 'text', text: 'Hello.' }])
  })

  it('normalizes tool_use blocks with a helpful detail', () => {
    const parse = claude.createParser!()
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/app/src/App.tsx' } }],
      },
    })
    expect(parse(line)).toEqual([{ type: 'tool', name: 'Edit', detail: '/app/src/App.tsx' }])
  })

  it('skips subagent messages', () => {
    const parse = claude.createParser!()
    const line = JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: 'toolu_123',
      message: { content: [{ type: 'text', text: 'subagent chatter' }] },
    })
    expect(parse(line)).toEqual([])
  })

  it('extracts session id and cost from result events', () => {
    const parse = claude.createParser!()
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Done.',
      session_id: 's-1',
      total_cost_usd: 0.42,
      duration_ms: 9000,
    })
    expect(parse(line)).toEqual([
      { type: 'result', ok: true, summary: 'Done.', sessionId: 's-1', costUsd: 0.42, durationMs: 9000 },
    ])
  })

  it('surfaces failing tool results, stays quiet on successes', () => {
    const parse = claude.createParser!()
    expect(
      parse(
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'ENOENT: no such file' }],
          },
        }),
      ),
    ).toEqual([{ type: 'status', text: '⚠ tool error · ENOENT: no such file' }])
    expect(
      parse(
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'fine' }] },
        }),
      ),
    ).toEqual([])
  })

  it('treats non-json lines as text instead of crashing', () => {
    const parse = claude.createParser!()
    expect(parse('plain output')).toEqual([{ type: 'text', text: 'plain output' }])
  })

  it('handles a realistic full-turn burst in order', () => {
    const parse = claude.createParser!()
    const events = [
      { type: 'system', subtype: 'init', model: 'claude-sonnet-5' },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Work' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ing.' } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Working.' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } },
      { type: 'result', subtype: 'success', is_error: false, result: 'Done.', session_id: 's', total_cost_usd: 0.1, duration_ms: 900 },
    ]
    const out = events.flatMap((e) => parse(JSON.stringify(e)))
    expect(out.map((e) => e.type)).toEqual(['status', 'delta', 'delta', 'text', 'tool', 'text', 'result'])
    // The streamed block dedupes; the post-tool block does not.
    expect(out[3]).toMatchObject({ type: 'text', streamed: true })
    expect(out[5]).toMatchObject({ type: 'text', text: 'Done.' })
    expect((out[5] as { streamed?: boolean }).streamed).toBeUndefined()
  })
})
