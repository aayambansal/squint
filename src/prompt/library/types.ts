import type { Platform } from '../platform.js'

/**
 * A skill squint ships with. Bodies are inlined into the ask (they are
 * self-contained and compact); a project can shadow one by writing
 * `.squint/skills/<name>.md` (`squint skills eject <name>` starts that).
 */
export interface BundledSkill {
  name: string
  /** One line for `squint skills list`. */
  summary: string
  /** Word-start keyword triggers, matched against the ask. */
  triggers: string[]
  /**
   * Auto-attach on design-shaped asks when the repo targets any of
   * these platforms, even without a trigger match.
   */
  platforms?: Platform[]
  body: string
  /** Appended to /review prompts whenever the skill is active. */
  reviewChecklist?: string
}
