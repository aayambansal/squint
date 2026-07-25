import { describe, expect, it } from 'vitest'
import { FAMILIES, getFamily, renderFamilyBrief } from '../src/prompt/families.js'

describe('families', () => {
  it('exposes the seven researched aesthetic families with unique ids', () => {
    const ids = FAMILIES.map((f) => f.id)
    expect(ids).toEqual([
      'editorial-minimal',
      'terminal',
      'warm-editorial',
      'data-dense',
      'cinematic-dark',
      'playful',
      'brutalist',
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(getFamily('terminal')?.name).toBe('Terminal-Core')
    expect(getFamily('nope')).toBeUndefined()
  })

  it('renders self-contained briefs: direction + core standards', () => {
    for (const family of FAMILIES) {
      const brief = renderFamilyBrief(family)
      expect(brief).toContain(`## Direction: ${family.name}`)
      // Direction section present…
      expect(brief).toContain('- Type:')
      expect(brief).toContain('- Avoid:')
      // …and the universal standards still apply.
      expect(brief).toContain('Tokens are the system:')
      expect(brief).toContain('Banned tells')
      expect(brief).toContain('Engineering:')
      expect(brief).toContain('committed design direction')
    }
  })

  it('each family commits to a distinct direction (no shared boilerplate direction text)', () => {
    const directions = FAMILIES.map((f) => f.direction)
    expect(new Set(directions).size).toBe(directions.length)
  })
})
