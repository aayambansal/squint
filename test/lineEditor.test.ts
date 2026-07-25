import { describe, expect, it } from 'vitest'
import {
  backspace,
  emptyLine,
  end,
  fromText,
  home,
  insert,
  killToEnd,
  killToStart,
  killWordBack,
  left,
  right,
  wordLeft,
  wordRight,
} from '../src/tui/lineEditor.js'

describe('lineEditor', () => {
  it('inserts at the cursor, including mid-line and pastes', () => {
    let line = insert(emptyLine, 'hello world')
    expect(line).toEqual({ text: 'hello world', cursor: 11 })
    line = home(line)
    line = insert(line, '>> ')
    expect(line.text).toBe('>> hello world')
    expect(line.cursor).toBe(3)
    // Pasted newlines flatten to spaces (single-line editor).
    expect(insert(emptyLine, 'a\nb\r\nc').text).toBe('a b c')
  })

  it('moves by character and clamps at boundaries', () => {
    let line = fromText('ab')
    line = right(line)
    expect(line.cursor).toBe(2)
    line = left(left(left(line)))
    expect(line.cursor).toBe(0)
  })

  it('backspaces mid-line without touching the tail', () => {
    let line = fromText('abcdef')
    line = { ...line, cursor: 3 }
    line = backspace(line)
    expect(line).toEqual({ text: 'abdef', cursor: 2 })
    expect(backspace(home(line))).toEqual({ text: 'abdef', cursor: 0 })
  })

  it('jumps by word, treating paths and flags as words', () => {
    const line = fromText('fix src/pages/Pricing.tsx --force now')
    let l = wordLeft(line)
    expect(line.text.slice(l.cursor)).toBe('now')
    l = wordLeft(l)
    expect(line.text.slice(l.cursor)).toBe('--force now')
    l = home(line)
    l = wordRight(l)
    expect(l.cursor).toBe(3) // past "fix"
    l = wordRight(l)
    expect(line.text.slice(0, l.cursor)).toBe('fix src/pages/Pricing.tsx')
  })

  it('kills to end, to start, and word-back', () => {
    let line = fromText('one two three')
    line = { ...line, cursor: 7 } // after "one two"
    expect(killToEnd(line)).toEqual({ text: 'one two', cursor: 7 })
    expect(killToStart(line)).toEqual({ text: ' three', cursor: 0 })
    expect(killWordBack(line)).toEqual({ text: 'one  three', cursor: 4 })
  })

  it('end returns to the tail', () => {
    expect(end(home(fromText('xyz'))).cursor).toBe(3)
  })
})
