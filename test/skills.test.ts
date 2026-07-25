import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enrich, loadLocks, loadRules, loadSkills, matchSkills, parseSkill } from '../src/prompt/skills.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-skills-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeSkill(name: string, content: string) {
  const skillsDir = path.join(dir, '.squint', 'skills')
  fs.mkdirSync(skillsDir, { recursive: true })
  fs.writeFileSync(path.join(skillsDir, name), content)
}

describe('parseSkill', () => {
  it('parses inline and list-form triggers', () => {
    const inline = parseSkill('a', '---\ntriggers: auth, login\n---\nUse the session helper.')
    expect(inline).toEqual({ name: 'a', triggers: ['auth', 'login'], body: 'Use the session helper.' })

    const list = parseSkill('b', '---\ntriggers:\n  - payments\n  - stripe\n---\nNever log card data.')
    expect(list?.triggers).toEqual(['payments', 'stripe'])
  })

  it('rejects files without frontmatter, triggers, or body', () => {
    expect(parseSkill('x', 'no frontmatter')).toBeNull()
    expect(parseSkill('x', '---\nother: y\n---\nbody')).toBeNull()
    expect(parseSkill('x', '---\ntriggers: a\n---\n')).toBeNull()
  })
})

describe('loadSkills / matchSkills', () => {
  it('loads valid skills and matches case-insensitively on triggers', () => {
    writeSkill('auth.md', '---\ntriggers: auth, login\n---\nAuth notes.')
    writeSkill('charts.md', '---\ntriggers: chart, graph\n---\nChart notes.')
    writeSkill('broken.md', 'not a skill')
    const skills = loadSkills(dir)
    expect(skills.map((s) => s.name)).toEqual(['auth', 'charts'])
    expect(matchSkills(skills, 'Fix the LOGIN page').map((s) => s.name)).toEqual(['auth'])
    expect(matchSkills(skills, 'add a bar chart and auth').map((s) => s.name)).toEqual(['auth', 'charts'])
    expect(matchSkills(skills, 'nothing relevant')).toEqual([])
  })
})

describe('enrich', () => {
  it('injects always-on rules plus matched skills as sections', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use pnpm, never npm.')
    writeSkill('auth.md', '---\ntriggers: auth\n---\nAuth flows live in src/auth.')

    const withMatch = enrich(dir, 'rework the auth screen')
    expect(withMatch.matchedSkills).toEqual(['auth'])
    expect(withMatch.sections).toContain('## Project rules (always apply)')
    expect(withMatch.sections).toContain('Use pnpm, never npm.')
    expect(withMatch.sections).toContain('## Project notes: auth')

    const noMatch = enrich(dir, 'change the footer')
    expect(noMatch.matchedSkills).toEqual([])
    expect(noMatch.sections).toContain('Project rules')
    expect(noMatch.sections).not.toContain('Project notes')

    expect(loadRules(os.tmpdir())).toBeNull()
    expect(enrich(os.tmpdir(), 'x').sections).toBe('')
  })

  it('injects the shadcn component inventory when components.json exists', () => {
    fs.writeFileSync(
      path.join(dir, 'components.json'),
      JSON.stringify({ aliases: { components: '@/components' } }),
    )
    const uiDir = path.join(dir, 'src', 'components', 'ui')
    fs.mkdirSync(uiDir, { recursive: true })
    fs.writeFileSync(path.join(uiDir, 'button.tsx'), '')
    fs.writeFileSync(path.join(uiDir, 'dialog.tsx'), '')
    fs.writeFileSync(path.join(uiDir, 'notes.md'), '')

    const enriched = enrich(dir, 'anything')
    expect(enriched.sections).toContain('Installed UI components')
    expect(enriched.sections).toContain('button · dialog')
    expect(enriched.sections).not.toContain('notes')
    expect(enriched.sections).toContain('shadcn@latest add')
  })

  it('injects locked paths as a hard constraint, skipping comments', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), '# do not touch\nsrc/legacy/**\npackage-lock.json\n\n')
    expect(loadLocks(dir)).toEqual(['src/legacy/**', 'package-lock.json'])
    const enriched = enrich(dir, 'anything')
    expect(enriched.sections).toContain('Locked files (hard constraint)')
    expect(enriched.sections).toContain('- src/legacy/**')
    expect(enriched.sections).toContain('stop and explain instead')
  })
})
