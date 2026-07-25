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
})

describe('codex.parseLine', () => {
  it('parses the newer item.completed shape', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'All set.' },
    })
    expect(codex.parseLine!(line)).toEqual([{ type: 'text', text: 'All set.' }])
  })

  it('parses legacy agent_message events', () => {
    const line = JSON.stringify({ id: '1', msg: { type: 'agent_message', message: 'Hi.' } })
    expect(codex.parseLine!(line)).toEqual([{ type: 'text', text: 'Hi.' }])
  })

  it('parses legacy command execution as a tool event', () => {
    const line = JSON.stringify({
      id: '2',
      msg: { type: 'exec_command_begin', command: ['npm', 'test'] },
    })
    expect(codex.parseLine!(line)).toEqual([{ type: 'tool', name: 'shell', detail: 'npm test' }])
  })

  it('maps task_complete to a result', () => {
    const line = JSON.stringify({ id: '3', msg: { type: 'task_complete', last_agent_message: 'ok' } })
    expect(codex.parseLine!(line)).toEqual([{ type: 'result', ok: true, summary: 'ok' }])
  })

  it('returns raw for unknown json shapes', () => {
    expect(codex.parseLine!('{"weird": true}')).toEqual([{ type: 'raw', data: { weird: true } }])
  })
})
