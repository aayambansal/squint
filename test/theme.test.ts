import { describe, expect, it } from 'vitest'
import { toolGlyph } from '../src/tui/messages.js'
import { DEFAULT_THEME, resolveTheme, THEMES } from '../src/tui/theme.js'

describe('parseOsc11', () => {
  it('classifies terminal backgrounds from OSC 11 replies', async () => {
    const { parseOsc11 } = await import('../src/tui/background.js')
    expect(parseOsc11('\x1b]11;rgb:1e1e/2020/2b2b\x07')).toBe('dark')
    expect(parseOsc11('\x1b]11;rgb:ffff/ffff/ffff\x1b\\')).toBe('light')
    expect(parseOsc11('\x1b]11;rgb:fd/f6/e3\x07')).toBe('light') // solarized-light, 2-digit
    expect(parseOsc11('garbage')).toBe('unknown')
  })
})

describe('toolGlyph', () => {
  it('maps tool families to distinct glyphs with a generic fallback', () => {
    expect(toolGlyph('Read · src/App.tsx')).toBe('⊙')
    expect(toolGlyph('Edit · src/App.tsx')).toBe('✎')
    expect(toolGlyph('Write · new.ts')).toBe('✎')
    expect(toolGlyph('Bash · npm test')).toBe('$')
    expect(toolGlyph('shell · ls')).toBe('$')
    expect(toolGlyph('Grep · pattern')).toBe('⌕')
    expect(toolGlyph('WebFetch · url')).toBe('⇣')
    expect(toolGlyph('TodoWrite')).toBe('☰')
    expect(toolGlyph('SomethingNew · x')).toBe('⚙')
  })
})

describe('themes', () => {
  it('every theme defines the full color vocabulary', () => {
    for (const [key, theme] of Object.entries(THEMES)) {
      expect(theme.name).toBe(key)
      for (const slot of ['accent', 'dim', 'user', 'error', 'success', 'tool'] as const) {
        expect(theme[slot], `${key}.${slot}`).toBeTruthy()
      }
    }
  })

  it('resolves by name with a safe default for unknowns', () => {
    expect(resolveTheme(undefined, {}).name).toBe(DEFAULT_THEME)
    expect(resolveTheme('ocean', {}).name).toBe('ocean')
    expect(resolveTheme('definitely-not-a-theme', {}).name).toBe(DEFAULT_THEME)
  })

  it('NO_COLOR forces mono regardless of the requested theme', () => {
    expect(resolveTheme('ocean', { NO_COLOR: '1' }).name).toBe('mono')
    expect(resolveTheme('amber', { NO_COLOR: '' }).name).toBe('amber')
  })
})
