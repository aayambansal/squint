import { describe, expect, it } from 'vitest'
import { supportsTextSizing, verdictBanner } from '../src/tui/banner.js'

describe('verdict banners', () => {
  it('detects OSC 66 terminals and honors the opt-out', () => {
    expect(supportsTextSizing({ TERM: 'xterm-kitty' } as NodeJS.ProcessEnv)).toBe(true)
    expect(supportsTextSizing({ TERM_PROGRAM: 'ghostty' } as NodeJS.ProcessEnv)).toBe(true)
    expect(supportsTextSizing({ TERM: 'xterm-256color' } as NodeJS.ProcessEnv)).toBe(false)
    expect(supportsTextSizing({ TERM: 'xterm-kitty', SQUINT_NO_BANNER: '1' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('renders scaled text on capable terminals', () => {
    const lines = verdictBanner('pass', 'ALL GREEN', { TERM: 'xterm-kitty' } as NodeJS.ProcessEnv)
    expect(lines).toEqual(['\x1b]66;s=2;✓ ALL GREEN\x07'])
  })

  it('falls back to a boxed banner elsewhere', () => {
    const lines = verdictBanner('fail', '3 PROBLEMS', { TERM: 'dumb' } as NodeJS.ProcessEnv)
    expect(lines.length).toBe(3)
    expect(lines[1]).toContain('✗ 3 PROBLEMS')
    expect(lines[0]!.startsWith('┌')).toBe(true)
    expect(lines[2]!.startsWith('└')).toBe(true)
  })
})
