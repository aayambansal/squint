import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, resolveTheme, THEMES } from '../src/tui/theme.js'

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
