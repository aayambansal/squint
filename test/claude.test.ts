import { describe, expect, it } from 'vitest'
import { claude } from '../src/engines/claude.js'

describe('claude.buildArgs', () => {
  it('builds a headless stream-json invocation', () => {
    const args = claude.buildArgs({ prompt: 'build a navbar', cwd: '/tmp' })
    expect(args).toEqual([
      '-p',
      'build a navbar',
      '--output-format',
      'stream-json',
      '--verbose',
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

describe('claude.parseLine', () => {
  it('normalizes assistant text blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Working on it.' }] },
    })
    expect(claude.parseLine!(line)).toEqual([{ type: 'text', text: 'Working on it.' }])
  })

  it('normalizes tool_use blocks with a helpful detail', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/app/src/App.tsx' } }],
      },
    })
    expect(claude.parseLine!(line)).toEqual([
      { type: 'tool', name: 'Edit', detail: '/app/src/App.tsx' },
    ])
  })

  it('extracts session id and cost from result events', () => {
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Done.',
      session_id: 's-1',
      total_cost_usd: 0.42,
      duration_ms: 9000,
    })
    expect(claude.parseLine!(line)).toEqual([
      { type: 'result', ok: true, summary: 'Done.', sessionId: 's-1', costUsd: 0.42, durationMs: 9000 },
    ])
  })

  it('treats non-json lines as text instead of crashing', () => {
    expect(claude.parseLine!('plain output')).toEqual([{ type: 'text', text: 'plain output' }])
  })
})
