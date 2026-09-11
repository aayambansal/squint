import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_SKILLS,
  activeBundledSkills,
  describeActivation,
  getBundledSkill,
  isDesignAsk,
  mentions,
  reviewGuidance,
} from '../src/prompt/library/index.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-library-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const tokens = (text: string) => Math.ceil(text.length / 4)

describe('the bundled library', () => {
  it('ships the platform skills and the taste layer, each self-contained and affordable', () => {
    expect(BUNDLED_SKILLS.map((s) => s.name)).toEqual(['apple-hig', 'material-android', 'desktop-app', 'design-taste'])
    for (const skill of BUNDLED_SKILLS) {
      expect(skill.body.startsWith('# ')).toBe(true)
      expect(skill.triggers.length).toBeGreaterThan(3)
      // Shorter than the brief's skim threshold: these ride inside asks.
      expect(tokens(skill.body)).toBeLessThan(1700)
      expect(skill.reviewChecklist).toBeTruthy()
      // No trigger short enough to fire on noise.
      for (const t of skill.triggers) expect(t.length).toBeGreaterThanOrEqual(2)
    }
    expect(getBundledSkill('apple-hig')?.platforms).toEqual(['ios'])
    expect(getBundledSkill('nope')).toBeUndefined()
  })

  it('carries the specific knowledge each skill exists for', () => {
    const hig = getBundledSkill('apple-hig')!.body
    expect(hig).toContain('44×44pt')
    expect(hig).toContain('Dynamic Type')
    expect(hig).toContain('Liquid Glass')
    expect(hig).toContain('Menu bar with the standard menus')

    const material = getBundledSkill('material-android')!.body
    expect(material).toContain('48×48dp')
    expect(material).toContain('Window size classes')
    expect(material).toContain('surfaceContainer')
    expect(material).toContain('Sentence case')

    const desktop = getBundledSkill('desktop-app')!.body
    expect(desktop).toContain('command palette')
    expect(desktop).toContain('-webkit-app-region')

    const taste = getBundledSkill('design-taste')!.body
    expect(taste).toContain('One primary action per view')
    expect(taste).toContain('APCA')
    expect(taste).toContain('prefers-reduced-motion')
  })
})

describe('mentions / isDesignAsk', () => {
  it('matches at word starts and requires whole words for short terms', () => {
    expect(mentions('build the pipeline', 'ui')).toBe(false)
    expect(mentions('polish the ui', 'ui')).toBe(true)
    expect(mentions('the UI, please', 'ui')).toBe(true)
    expect(mentions('buttons everywhere', 'button')).toBe(true)
    expect(mentions('the format string', 'form')).toBe(false)
    expect(mentions('a signup form', 'form')).toBe(true)
    expect(mentions('use m3 tokens', 'm3')).toBe(true)
    expect(mentions('a c++ parser', 'c++')).toBe(true)
  })

  it('separates design-shaped asks from plumbing', () => {
    expect(isDesignAsk('redesign the hero and tighten typography')).toBe(true)
    expect(isDesignAsk('make the dashboard responsive')).toBe(true)
    expect(isDesignAsk('fix the retry logic in the api client')).toBe(false)
    expect(isDesignAsk('bump dependencies')).toBe(false)
  })
})

describe('activeBundledSkills / reviewGuidance', () => {
  it('attaches by trigger anywhere and by platform only on design asks', () => {
    const byTrigger = activeBundledSkills(dir, 'the ios tab bar', ['web'])
    expect(byTrigger.map((a) => [a.skill.name, a.reason])).toEqual([
      ['apple-hig', 'mentions "ios"'],
      ['design-taste', 'mentions "tab bar"'],
    ])
    expect(activeBundledSkills(dir, 'add a settings screen', ['web', 'android']).map((a) => a.reason)).toEqual([
      'android project',
      'mentions "screen"',
    ])
    expect(activeBundledSkills(dir, 'fix the crash on launch', ['ios', 'android', 'desktop'])).toEqual([])
  })

  it('appends the taste rubric always and platform checklists only for targeted platforms', () => {
    const web = reviewGuidance(dir, ['web'])
    expect(web).toContain('## Review standards')
    expect(web).toContain('Blocker / High / Medium / Nit')
    expect(web).not.toContain('Apple targets')
    const mobile = reviewGuidance(dir, ['ios', 'android'])
    expect(mobile).toContain('Apple targets')
    expect(mobile).toContain('Android targets')
    expect(mobile).not.toContain('Desktop targets')
  })

  it('describes activation for lists and the context doctor', () => {
    expect(describeActivation(getBundledSkill('apple-hig')!)).toMatch(/^design asks in ios projects, or mentions "ios", "iphone"/)
    expect(describeActivation(getBundledSkill('design-taste')!)).toMatch(/^mentions "design", "redesign"/)
  })
})
