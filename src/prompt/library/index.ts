import { detectPlatforms, type Platform } from '../platform.js'
import { appleHig } from './appleHig.js'
import { desktopApp } from './desktop.js'
import { materialAndroid } from './material.js'
import { designTaste } from './taste.js'
import type { BundledSkill } from './types.js'

export type { BundledSkill } from './types.js'

/**
 * The design library squint ships with. Platform skills come first so the
 * engine reads the concrete conventions before the general craft rules.
 */
export const BUNDLED_SKILLS: BundledSkill[] = [appleHig, materialAndroid, desktopApp, designTaste]

export function getBundledSkill(name: string): BundledSkill | undefined {
  return BUNDLED_SKILLS.find((s) => s.name === name)
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Keyword match at a word start: "ui" never fires inside "build", while
 * "button" still catches "buttons". Terms of four characters or fewer
 * must match a whole word — short triggers are where false positives live.
 */
export function mentions(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase()
  if (t.length === 0) return false
  const tail = t.length <= 4 ? '(?![a-z0-9])' : ''
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}${tail}`, 'i').test(haystack)
}

/**
 * Words that mark an ask as design-shaped. Platform skills auto-attach
 * only on these, so "fix the API retry" never pays for the HIG.
 */
const DESIGN_WORDS = designTaste.triggers

export function isDesignAsk(ask: string): boolean {
  const haystack = ask.toLowerCase()
  return DESIGN_WORDS.some((w) => mentions(haystack, w))
}

export interface ActiveSkill {
  skill: BundledSkill
  /** Why it attached: a matched trigger, or a detected platform. */
  reason: string
}

/**
 * Which bundled skills ride along on this ask: trigger matches always;
 * platform skills also on design-shaped asks when the repo targets them.
 */
export function activeBundledSkills(cwd: string, ask: string, platforms: Platform[] = detectPlatforms(cwd)): ActiveSkill[] {
  const haystack = ask.toLowerCase()
  const design = isDesignAsk(ask)
  const active: ActiveSkill[] = []
  for (const skill of BUNDLED_SKILLS) {
    const trigger = skill.triggers.find((t) => mentions(haystack, t))
    if (trigger) {
      active.push({ skill, reason: `mentions "${trigger}"` })
      continue
    }
    const platform = skill.platforms?.find((p) => platforms.includes(p))
    if (platform && design) active.push({ skill, reason: `${platform} project` })
  }
  return active
}

/**
 * The review standards appended to every /review prompt: the taste
 * rubric plus the checklist of each platform skill the repo targets.
 */
export function reviewGuidance(cwd: string, platforms: Platform[] = detectPlatforms(cwd)): string {
  const parts: string[] = []
  for (const skill of BUNDLED_SKILLS) {
    if (!skill.reviewChecklist) continue
    const platformHit = skill.platforms ? skill.platforms.some((p) => platforms.includes(p)) : true
    if (platformHit) parts.push(skill.reviewChecklist)
  }
  if (parts.length === 0) return ''
  return `\n\n## Review standards\n\n${parts.join('\n')}`
}

/** Human-readable "when it fires" for lists and the context doctor. */
export function describeActivation(skill: BundledSkill): string {
  const triggers = skill.triggers.slice(0, 4).map((t) => `"${t}"`).join(', ')
  const platform = skill.platforms ? `design asks in ${skill.platforms.join('/')} projects, or ` : ''
  return `${platform}mentions ${triggers}${skill.triggers.length > 4 ? ', …' : ''}`
}
