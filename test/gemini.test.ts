import { describe, expect, it } from 'vitest'
import { gemini } from '../src/engines/gemini.js'

describe('gemini.buildArgs', () => {
  it('streams ndjson with mode-mapped approval', () => {
    const args = gemini.buildArgs({ prompt: 'p', cwd: '/tmp' })
    expect(args).toContain('stream-json')
    expect(args).toContain('auto_edit')
    expect(gemini.buildArgs({ prompt: 'p', cwd: '/tmp', mode: 'plan' })).toContain('plan')
    expect(gemini.buildArgs({ prompt: 'p', cwd: '/tmp', mode: 'yolo' })).toContain('yolo')
  })
})

describe('gemini parser', () => {
  it('normalizes init, message, tool, and result events', () => {
    const parse = gemini.createParser!()
    expect(parse(JSON.stringify({ type: 'init', model: 'gemini-2.5-pro' }))).toEqual([
      { type: 'status', text: 'gemini ready · gemini-2.5-pro' },
    ])
    expect(parse(JSON.stringify({ type: 'message', role: 'assistant', content: 'Hi.' }))).toEqual([
      { type: 'text', text: 'Hi.' },
    ])
    // Alternate content keys survive; user messages are skipped.
    expect(parse(JSON.stringify({ type: 'message', role: 'model', text: 'alt' }))).toEqual([
      { type: 'text', text: 'alt' },
    ])
    expect(parse(JSON.stringify({ type: 'message', role: 'user', content: 'echo' }))).toEqual([])
    expect(parse(JSON.stringify({ type: 'tool_use', name: 'write_file', args: { p: 'x' } }))).toEqual([
      { type: 'tool', name: 'write_file', detail: '{"p":"x"}' },
    ])
    expect(parse(JSON.stringify({ type: 'result', response: 'done' }))).toEqual([
      { type: 'result', ok: true, summary: 'done' },
    ])
  })

  it('keeps non-fatal errors quiet and non-json lines as text', () => {
    const parse = gemini.createParser!()
    expect(parse(JSON.stringify({ type: 'error', fatal: false, message: 'retrying' }))).toEqual([])
    expect(parse(JSON.stringify({ type: 'error', message: 'boom' }))).toEqual([
      { type: 'error', text: 'boom' },
    ])
    expect(parse('plain line')).toEqual([{ type: 'text', text: 'plain line' }])
  })
})
