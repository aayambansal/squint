import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { decisionsSection } from '../session/designLog.js'
import { activeBundledSkills, mentions } from './library/index.js'
import { inventorySection, loadComponentInventory } from './registry.js'

/**
 * Skills: deterministic, zero-embedding context routing (the OpenHands
 * microagents pattern). Three sources, one matcher:
 *
 * - project `.squint/skills/*.md` — `triggers:` frontmatter, body inlined;
 * - bundled — squint's own design library (HIG, Material, desktop, taste),
 *   inlined on trigger or platform match; a project file of the same name
 *   shadows it;
 * - external `SKILL.md` — the standard skill format in `.claude/skills`,
 *   `.cursor/skills`, `.agents/skills`, `.codex/skills` (project and home).
 *   Matched by explicit `triggers:` or by name, injected as a pointer the
 *   engine reads from disk, so a skill's own relative files keep working.
 *
 * `.squint/rules.md` is always-on.
 */
export type SkillSource = 'project' | 'external'

export interface Skill {
  name: string
  triggers: string[]
  body: string
  source: SkillSource
  /** SKILL.md description, when the file has one. */
  description?: string
  /** Absolute path of the SKILL.md for external skills. */
  file?: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function frontmatterValue(frontmatter: string, key: string): string | null {
  const line = new RegExp(`(^|\\n)${key}:[ \\t]*(.*)`).exec(frontmatter)
  if (!line) return null
  const inline = line[2]!.trim()
  // Block scalars (`>` / `|`) and bare keys continue on indented lines.
  if (inline.length === 0 || inline === '>' || inline === '|' || inline === '>-' || inline === '|-') {
    const after = frontmatter.slice(line.index + line[0].length)
    const collected: string[] = []
    for (const raw of after.split('\n')) {
      if (raw.trim().length === 0) {
        if (collected.length > 0) break
        continue
      }
      if (!/^\s+/.test(raw)) break
      collected.push(raw.trim())
    }
    return collected.join(' ').trim()
  }
  return inline.replace(/^["']|["']$/g, '')
}

function listValue(frontmatter: string, key: string): string[] | null {
  const line = new RegExp(`(^|\\n)${key}:[ \\t]*(.*)`).exec(frontmatter)
  if (!line) return null
  const inline = line[2]!.trim()
  if (inline.length > 0) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, '').toLowerCase())
      .filter((t) => t.length > 0)
  }
  // YAML list form: each "- item" line after the key.
  const after = frontmatter.slice(line.index + line[0].length)
  const items: string[] = []
  for (const raw of after.split('\n')) {
    const m = /^\s*-\s+(.+)$/.exec(raw)
    if (m) items.push(m[1]!.trim().replace(/^["']|["']$/g, '').toLowerCase())
    else if (raw.trim().length > 0 && !/^\s/.test(raw)) break
  }
  return items
}

/** Triggers a skill earns from its name alone: "apple-design" → apple-design, apple design. */
function nameTriggers(name: string): string[] {
  const lower = name.toLowerCase()
  const spaced = lower.replace(/[-_]+/g, ' ')
  return spaced === lower ? [lower] : [lower, spaced]
}

/**
 * Parse a skill file. Accepts squint's `triggers:` form and the standard
 * SKILL.md form (`name:` / `description:`), which falls back to name
 * triggers. Files without frontmatter, triggers, or a body are not skills.
 */
export function parseSkill(name: string, raw: string, source: SkillSource = 'project', file?: string): Skill | null {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return null
  const frontmatter = match[1]!
  const body = raw.slice(match[0].length).trim()
  const declaredName = frontmatterValue(frontmatter, 'name')
  const description = frontmatterValue(frontmatter, 'description') ?? undefined
  const skillName = declaredName && declaredName.length > 0 ? declaredName : name

  let triggers = listValue(frontmatter, 'triggers')
  if (triggers === null) {
    // The standard format has no triggers; the name is the trigger.
    if (!declaredName && !description) return null
    triggers = nameTriggers(skillName)
  }
  triggers = triggers.filter((t) => t.length > 0)
  if (triggers.length === 0 || body.length === 0) return null
  return { name: skillName, triggers, body, source, description, file }
}

export function loadSkills(cwd: string): Skill[] {
  const dir = path.join(cwd, '.squint', 'skills')
  let entries: string[]
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  const skills: Skill[] = []
  for (const entry of entries.sort()) {
    try {
      const skill = parseSkill(entry.replace(/\.md$/, ''), fs.readFileSync(path.join(dir, entry), 'utf8'))
      if (skill) skills.push(skill)
    } catch {
      // unreadable skill files never break a turn
    }
  }
  return skills
}

/** Where the skills ecosystem keeps `<name>/SKILL.md` folders. */
const EXTERNAL_SKILL_DIRS = ['.claude/skills', '.cursor/skills', '.agents/skills', '.codex/skills']

/**
 * Standard-format skills from the project and the home directory. The
 * project wins on name clashes, then the first directory in the list.
 */
export function loadExternalSkills(cwd: string, home: string = os.homedir()): Skill[] {
  const seen = new Set<string>()
  const skills: Skill[] = []
  const roots = [cwd, home].filter((r, i, all) => r && all.indexOf(r) === i)
  for (const root of roots) {
    for (const rel of EXTERNAL_SKILL_DIRS) {
      const dir = path.join(root, rel)
      let entries: string[]
      try {
        entries = fs.readdirSync(dir)
      } catch {
        continue
      }
      for (const entry of entries.sort()) {
        const file = path.join(dir, entry, 'SKILL.md')
        try {
          if (!fs.statSync(file).isFile()) continue
          const skill = parseSkill(entry, fs.readFileSync(file, 'utf8'), 'external', file)
          if (skill && !seen.has(skill.name)) {
            seen.add(skill.name)
            skills.push(skill)
          }
        } catch {
          // not a skill folder, or unreadable: skip
        }
      }
    }
  }
  return skills
}

export function loadRules(cwd: string): string | null {
  try {
    const text = fs.readFileSync(path.join(cwd, '.squint', 'rules.md'), 'utf8').trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

export function matchSkills(skills: Skill[], ask: string): Skill[] {
  const haystack = ask.toLowerCase()
  return skills.filter((skill) => skill.triggers.some((t) => mentions(haystack, t)))
}

/** Paths the engine must never touch: .squint/locks, one per line. */
export function loadLocks(cwd: string): string[] {
  try {
    return fs
      .readFileSync(path.join(cwd, '.squint', 'locks'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  } catch {
    return []
  }
}

/** The pointer an external skill injects: cheap, and its relative files still resolve. */
export function externalSkillSection(skill: Skill): string {
  const description = skill.description ? `\n\n${skill.description}` : ''
  return `## Skill available: ${skill.name}${description}\n\nFull instructions: ${skill.file}\nRead that file before starting and follow it for this task.`
}

export interface EnrichOptions {
  /** Inject squint's bundled design library (default true). */
  bundled?: boolean
  /** Home directory scanned for external SKILL.md folders (test hook). */
  home?: string
}

export interface Enrichment {
  sections: string
  matchedSkills: string[]
}

/** Rules + ledger + inventory + locks (always) + every matched skill source. */
export function enrich(cwd: string, ask: string, opts: EnrichOptions = {}): Enrichment {
  const parts: string[] = []
  const rules = loadRules(cwd)
  if (rules) parts.push(`## Project rules (always apply)\n\n${rules}`)
  const decisions = decisionsSection(cwd)
  if (decisions) parts.push(decisions)
  // Registry awareness: composing from real components beats inventing.
  const inventory = loadComponentInventory(cwd)
  if (inventory) parts.push(inventorySection(inventory))
  const locks = loadLocks(cwd)
  if (locks.length > 0) {
    parts.push(
      `## Locked files (hard constraint)\n\nNever modify these paths, no matter what the task seems to need:\n${locks
        .map((l) => `- ${l}`)
        .join('\n')}\nIf the task appears to require changing them, stop and explain instead.`,
    )
  }
  parts.push(
    '## Requesting visual approval\n\nFor a visual decision you should not make alone (a redesign direction, removing something deliberate, reversing a design decision on record): write .squint/approval-request.json containing {"summary": "<one line>", "screenshot": "<path, optional>"} and end your turn immediately without making the change. The user\'s verdict arrives as the next message.\n\n## Persistent checks\n\nWhen you verify something about the page that should stay true (an element exists, a state renders, a metric holds), persist it as .squint/checks/<name>.js — plain JS that evaluates IN THE PAGE to an array of failure strings (empty array = pass). squint replays every check against the live page after each turn.',
  )
  const matchedNames: string[] = []

  const projectSkills = loadSkills(cwd)
  for (const skill of matchSkills(projectSkills, ask)) {
    parts.push(`## Project notes: ${skill.name}\n\n${skill.body}`)
    matchedNames.push(skill.name)
  }

  if (opts.bundled !== false) {
    const shadowed = new Set(projectSkills.map((s) => s.name))
    for (const { skill } of activeBundledSkills(cwd, ask)) {
      if (shadowed.has(skill.name)) continue
      parts.push(`## Design guidance: ${skill.name}\n\n${skill.body}`)
      matchedNames.push(skill.name)
    }
  }

  const taken = new Set([...matchedNames, ...projectSkills.map((s) => s.name)])
  for (const skill of matchSkills(loadExternalSkills(cwd, opts.home), ask)) {
    if (taken.has(skill.name)) continue
    parts.push(externalSkillSection(skill))
    matchedNames.push(skill.name)
  }

  return {
    sections: parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '',
    matchedSkills: matchedNames,
  }
}
