import { describe, expect, it } from 'vitest'
import { parseBlocks, parseInline } from '../src/tui/markdown.js'

describe('parseInline', () => {
  it('splits bold, italic, and code spans', () => {
    expect(parseInline('a **b** c `d` *e*')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c ' },
      { text: 'd', code: true },
      { text: ' ' },
      { text: 'e', italic: true },
    ])
  })

  it('passes plain text through untouched', () => {
    expect(parseInline('nothing special here')).toEqual([{ text: 'nothing special here' }])
  })
})

describe('parseBlocks', () => {
  it('parses headings, lists, quotes, rules, and paragraphs', () => {
    const blocks = parseBlocks('# Title\n\n- one\n  - nested\n2. second\n> note\n---\nplain')
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'para', text: '' },
      { type: 'item', text: 'one', indent: 0 },
      { type: 'item', text: 'nested', indent: 1 },
      { type: 'item', text: 'second', indent: 0, ordered: '2' },
      { type: 'quote', text: 'note' },
      { type: 'hr' },
      { type: 'para', text: 'plain' },
    ])
  })

  it('captures fenced code with language', () => {
    const blocks = parseBlocks('```ts\nconst a = 1\n\nconst b = 2\n```\nafter')
    expect(blocks).toEqual([
      { type: 'code', lang: 'ts', lines: ['const a = 1', '', 'const b = 2'] },
      { type: 'para', text: 'after' },
    ])
  })

  it('treats an unclosed fence as code (streaming forgiveness)', () => {
    const blocks = parseBlocks('before\n```js\nstill streaming')
    expect(blocks).toEqual([
      { type: 'para', text: 'before' },
      { type: 'code', lang: 'js', lines: ['still streaming'] },
    ])
  })

  it('does not mistake list dashes for rules', () => {
    expect(parseBlocks('- a')[0]?.type).toBe('item')
    expect(parseBlocks('***')[0]?.type).toBe('hr')
    expect(parseBlocks('___')[0]?.type).toBe('hr')
  })
})
