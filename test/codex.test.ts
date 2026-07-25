import { describe, expect, it } from 'vitest'
import { codex } from '../src/engines/codex.js'

describe('codex.buildArgs', () => {
  it('uses exec with json output and a writable sandbox', () => {
    const args = codex.buildArgs({ prompt: 'fix the header', cwd: '/tmp' })
    expect(args[0]).toBe('exec')
    expect(args).toContain('--json')
    expect(args).toContain('--sandbox')
    expect(args[args.length - 1]).toBe('fix the header')
  })

  it('resumes a session via exec resume <id>', () => {
    const args = codex.buildArgs({ prompt: 'continue', cwd: '/tmp', sessionId: 'thread-9' })
    expect(args.slice(0, 3)).toEqual(['exec', 'resume', 'thread-9'])
    expect(args[args.length - 1]).toBe('continue')
  })
})

describe('codex parser', () => {
  it('captures thread id and attaches it to the result', () => {
    const parse = codex.createParser!()
    expect(parse(JSON.stringify({ type: 'thread.started', thread_id: 't-1' }))).toEqual([
      { type: 'status', text: 'codex ready' },
    ])
    expect(parse(JSON.stringify({ type: 'turn.completed', usage: {} }))).toEqual([
      { type: 'result', ok: true, sessionId: 't-1' },
    ])
  })

  it('parses item events: message on completion, command on start', () => {
    const parse = codex.createParser!()
    expect(
      parse(
        JSON.stringify({
          type: 'item.started',
          item: { type: 'command_execution', command: 'npm test' },
        }),
      ),
    ).toEqual([{ type: 'tool', name: 'shell', detail: 'npm test' }])
    expect(
      parse(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'All set.' } })),
    ).toEqual([{ type: 'text', text: 'All set.' }])
    // No duplicate message from item.started
    expect(
      parse(JSON.stringify({ type: 'item.started', item: { type: 'agent_message', text: 'All set.' } })),
    ).toEqual([])
  })

  it('parses file changes', () => {
    const parse = codex.createParser!()
    expect(
      parse(
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'file_change', changes: [{ path: 'src/App.tsx', kind: 'edit' }] },
        }),
      ),
    ).toEqual([{ type: 'tool', name: 'edit', detail: 'src/App.tsx' }])
  })

  it('parses legacy agent_message and task_complete events', () => {
    const parse = codex.createParser!()
    expect(parse(JSON.stringify({ id: '1', msg: { type: 'agent_message', message: 'Hi.' } }))).toEqual([
      { type: 'text', text: 'Hi.' },
    ])
    expect(
      parse(JSON.stringify({ id: '3', msg: { type: 'task_complete', last_agent_message: 'ok' } })),
    ).toEqual([{ type: 'result', ok: true, summary: 'ok' }])
  })

  it('maps turn.failed to a failed result', () => {
    const parse = codex.createParser!()
    expect(parse(JSON.stringify({ type: 'turn.failed', error: { message: 'boom' } }))).toEqual([
      { type: 'result', ok: false, summary: 'boom', sessionId: undefined },
    ])
  })

  it('returns raw for unknown json shapes', () => {
    const parse = codex.createParser!()
    expect(parse('{"weird": true}')).toEqual([{ type: 'raw', data: { weird: true } }])
  })
})
