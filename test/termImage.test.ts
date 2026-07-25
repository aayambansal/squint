import { describe, expect, it } from 'vitest'
import { supportsInlineImages } from '../src/tui/termImage.js'

describe('supportsInlineImages', () => {
  it('recognizes the kitty/iTerm2 protocol family by environment', () => {
    expect(supportsInlineImages({ TERM: 'xterm-kitty' })).toBe(true)
    expect(supportsInlineImages({ KITTY_WINDOW_ID: '1' })).toBe(true)
    expect(supportsInlineImages({ TERM: 'xterm-ghostty' })).toBe(true)
    expect(supportsInlineImages({ TERM_PROGRAM: 'WezTerm' })).toBe(true)
    expect(supportsInlineImages({ TERM_PROGRAM: 'iTerm.app' })).toBe(true)
  })

  it('declines unknown terminals and anything under tmux', () => {
    expect(supportsInlineImages({ TERM: 'xterm-256color' })).toBe(false)
    expect(supportsInlineImages({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(false)
    expect(supportsInlineImages({ TERM: 'xterm-kitty', TMUX: '/tmp/tmux-1' })).toBe(false)
    expect(supportsInlineImages({})).toBe(false)
  })
})
