import fs from 'node:fs'
import path from 'node:path'
import { decisionsSection } from '../session/designLog.js'
import { inventorySection, loadComponentInventory } from './registry.js'

/**
 * Repo skills: deterministic, zero-embedding context routing (the
 * OpenHands microagents pattern). `.squint/rules.md` is always-on;
 * `.squint/skills/*.md` declare `triggers:` in frontmatter and inject
 * only when the ask mentions one.
 */
export interface Skill {
  name: string
  triggers: string[]
  body: string
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

export function parseSkill(name: string, raw: string): Skill | null {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return null
  const body = raw.slice(match[0].length).trim()
  // Horizontal whitespace only: \s would swallow the newline and turn
  // the YAML-list form into a bogus inline value.
  const triggersLine = /(^|\n)triggers:[ \t]*(.*)/.exec(match[1]!)
  if (!triggersLine) return null
  let triggers: string[]
  const inline = triggersLine[2]!.trim()
  if (inline.length > 0) {
    triggers = inline.split(',').map((t) => t.trim().toLowerCase())
  } else {
    // YAML list form: each "- item" line after "triggers:".
    triggers = [...match[1]!.matchAll(/\n\s*-\s+(.+)/g)].map((m) => m[1]!.trim().toLowerCase())
  }
  triggers = triggers.filter((t) => t.length > 0)
  if (triggers.length === 0 || body.length === 0) return null
  return { name, triggers, body }
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
  return skills.filter((skill) => skill.triggers.some((t) => haystack.includes(t)))
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

export interface Enrichment {
  sections: string
  matchedSkills: string[]
}

/** Rules + locks + component inventory (always) + trigger-matched skills. */
export function enrich(cwd: string, ask: string): Enrichment {
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
  const matched = matchSkills(loadSkills(cwd), ask)
  for (const skill of matched) {
    parts.push(`## Project notes: ${skill.name}\n\n${skill.body}`)
  }
  return {
    sections: parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '',
    matchedSkills: matched.map((s) => s.name),
  }
}
