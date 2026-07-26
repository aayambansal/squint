import { describe, expect, it } from 'vitest'
import { setProgress, withProgress } from '../src/tui/progress.js'

function fakeTty(): { stream: NodeJS.WriteStream; written: string[] } {
  const written: string[] = []
  const stream = { isTTY: true, write: (s: string) => written.push(s) } as unknown as NodeJS.WriteStream
  return { stream, written }
}

describe('OSC 9;4 progress', () => {
  it('emits normal/error/clear sequences with clamped percent', () => {
    const { stream, written } = fakeTty()
    setProgress('normal', 42, stream)
    setProgress('error', 200, stream)
    setProgress('clear', 0, stream)
    expect(written).toEqual(['\x1b]9;4;1;42\x07', '\x1b]9;4;2;100\x07', '\x1b]9;4;0;0\x07'])
  })

  it('stays silent on non-TTY and under NO_COLOR', () => {
    const written: string[] = []
    const nonTty = { isTTY: false, write: (s: string) => written.push(s) } as unknown as NodeJS.WriteStream
    setProgress('normal', 50, nonTty)
    expect(written).toEqual([])

    const { stream, written: w2 } = fakeTty()
    process.env.NO_COLOR = '1'
    setProgress('normal', 50, stream)
    delete process.env.NO_COLOR
    expect(w2).toEqual([])
  })

  it('withProgress always clears, even when work throws', async () => {
    const { stream, written } = fakeTty()
    await expect(withProgress(async () => { throw new Error('boom') }, stream)).rejects.toThrow('boom')
    expect(written[0]).toBe('\x1b]9;4;3;0\x07')
    expect(written.at(-1)).toBe('\x1b]9;4;0;0\x07')
  })
})
