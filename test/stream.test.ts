import { describe, expect, it } from 'vitest'
import { lineSplitter, truncate } from '../src/util/stream.js'

describe('lineSplitter', () => {
  it('emits complete lines across chunk boundaries', () => {
    const lines: string[] = []
    const splitter = lineSplitter((line) => lines.push(line))
    splitter.push('hello wo')
    splitter.push('rld\nsecond li')
    splitter.push('ne\n')
    expect(lines).toEqual(['hello world', 'second line'])
  })

  it('flushes a trailing partial line', () => {
    const lines: string[] = []
    const splitter = lineSplitter((line) => lines.push(line))
    splitter.push('no newline at end')
    splitter.flush()
    expect(lines).toEqual(['no newline at end'])
  })

  it('skips blank lines and strips carriage returns', () => {
    const lines: string[] = []
    const splitter = lineSplitter((line) => lines.push(line))
    splitter.push('a\r\n\n\nb\n')
    expect(lines).toEqual(['a', 'b'])
  })
})

describe('truncate', () => {
  it('leaves short strings alone and shortens long ones', () => {
    expect(truncate('abc', 5)).toBe('abc')
    expect(truncate('abcdefgh', 5)).toBe('abcd…')
  })
})
