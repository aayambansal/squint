import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  enrich,
  externalSkillSection,
  loadExternalSkills,
  loadLocks,
  loadRules,
  loadSkills,
  matchSkills,
  parseSkill,
} from '../src/prompt/skills.js'

let dir: string
/** A stand-in home so tests never read the developer's real skill folders. */
let home: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-skills-'))
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-home-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(home, { recursive: true, force: true })
})

function writeSkill(name: string, content: string) {
  const skillsDir = path.join(dir, '.squint', 'skills')
  fs.mkdirSync(skillsDir, { recursive: true })
  fs.writeFileSync(path.join(skillsDir, name), content)
}

function writeExternal(root: string, folder: string, name: string, content: string) {
  const skillDir = path.join(root, folder, name)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content)
}

/** Hermetic enrich: no bundled library, no real home directory. */
const plain = (ask: string) => enrich(dir, ask, { bundled: false, home })

describe('parseSkill', () => {
  it('parses inline and list-form triggers', () => {
    const inline = parseSkill('a', '---\ntriggers: auth, login\n---\nUse the session helper.')
    expect(inline).toMatchObject({ name: 'a', triggers: ['auth', 'login'], body: 'Use the session helper.', source: 'project' })

    const list = parseSkill('b', '---\ntriggers:\n  - payments\n  - stripe\n---\nNever log card data.')
    expect(list?.triggers).toEqual(['payments', 'stripe'])
  })

  it('rejects files without frontmatter, triggers, or body', () => {
    expect(parseSkill('x', 'no frontmatter')).toBeNull()
    expect(parseSkill('x', '---\nother: y\n---\nbody')).toBeNull()
    expect(parseSkill('x', '---\ntriggers: a\n---\n')).toBeNull()
  })

  it('accepts the standard SKILL.md format, deriving triggers from the name', () => {
    const skill = parseSkill(
      'folder-name',
      '---\nname: apple-design\ndescription: >\n  HIG-grounded design reviewer.\n  Use for iOS and macOS audits.\nversion: 1.0\n---\n# Review\nSteps…',
      'external',
      '/skills/apple-design/SKILL.md',
    )
    expect(skill).toMatchObject({
      name: 'apple-design',
      triggers: ['apple-design', 'apple design'],
      description: 'HIG-grounded design reviewer. Use for iOS and macOS audits.',
      source: 'external',
      file: '/skills/apple-design/SKILL.md',
    })
    // Explicit triggers win over the name when a SKILL.md declares them.
    const explicit = parseSkill('x', '---\nname: charts\ndescription: charts\ntriggers: [chart, "graph"]\n---\nbody')
    expect(explicit?.triggers).toEqual(['chart', 'graph'])
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

  it('matches at word starts only, so short triggers stop firing inside other words', () => {
    writeSkill('ui.md', '---\ntriggers: ui, button\n---\nUI notes.')
    const skills = loadSkills(dir)
    expect(matchSkills(skills, 'build the pipeline')).toEqual([]) // "ui" inside "build"
    expect(matchSkills(skills, 'polish the UI').map((s) => s.name)).toEqual(['ui'])
    expect(matchSkills(skills, 'the buttons wrap').map((s) => s.name)).toEqual(['ui']) // longer triggers still catch plurals
  })
})

describe('external SKILL.md discovery', () => {
  it('finds project and home skill folders, project first, deduped by name', () => {
    writeExternal(dir, '.claude/skills', 'impeccable', '---\nname: impeccable\ndescription: frontend craft\n---\n# body')
    writeExternal(home, '.codex/skills', 'apple-design', '---\nname: apple-design\ndescription: HIG reviewer\n---\n# body')
    writeExternal(home, '.agents/skills', 'impeccable', '---\nname: impeccable\ndescription: older copy\n---\n# body')
    fs.mkdirSync(path.join(home, '.cursor', 'skills', 'not-a-skill'), { recursive: true })

    const skills = loadExternalSkills(dir, home)
    expect(skills.map((s) => [s.name, s.description])).toEqual([
      ['impeccable', 'frontend craft'],
      ['apple-design', 'HIG reviewer'],
    ])
    expect(skills[1]!.file).toBe(path.join(home, '.codex', 'skills', 'apple-design', 'SKILL.md'))
  })

  it('injects a pointer, not the body, when an ask names an external skill', () => {
    writeExternal(home, '.claude/skills', 'apple-design', '---\nname: apple-design\ndescription: HIG reviewer\n---\n# Long body\n'.repeat(3))
    const hit = enrich(dir, 'use apple design to audit the settings screen', { bundled: false, home })
    expect(hit.matchedSkills).toEqual(['apple-design'])
    expect(hit.sections).toContain('## Skill available: apple-design')
    expect(hit.sections).toContain('HIG reviewer')
    expect(hit.sections).toContain(path.join('apple-design', 'SKILL.md'))
    expect(hit.sections).not.toContain('# Long body')

    const miss = enrich(dir, 'audit the settings screen', { bundled: false, home })
    expect(miss.matchedSkills).toEqual([])
    expect(externalSkillSection(loadExternalSkills(dir, home)[0]!)).toContain('Read that file before starting')
  })
})

describe('bundled design library', () => {
  it('attaches design-taste on design-shaped asks and stays out of plumbing asks', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-dom': '19' } }))
    const design = enrich(dir, 'redesign the pricing page hero', { home })
    expect(design.matchedSkills).toEqual(['design-taste'])
    expect(design.sections).toContain('## Design guidance: design-taste')
    expect(design.sections).toContain('Hierarchy')

    const plumbing = enrich(dir, 'retry the API call with backoff', { home })
    expect(plumbing.matchedSkills).toEqual([])
    expect(plumbing.sections).not.toContain('Design guidance')
  })

  it('auto-attaches platform skills on design asks when the repo targets that platform', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-native': '0.80', expo: '54' } }))
    const mobile = enrich(dir, 'tighten the spacing on the settings screen', { home })
    expect(mobile.matchedSkills).toEqual(['apple-hig', 'material-android', 'design-taste'])
    expect(mobile.sections).toContain('Safe areas are law')
    expect(mobile.sections).toContain('Window size classes')

    // A web repo only gets the platform skill when the ask names it.
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-dom': '19' } }))
    expect(enrich(dir, 'tighten the spacing on the settings screen', { home }).matchedSkills).toEqual(['design-taste'])
    expect(enrich(dir, 'make the tab bar feel like iOS', { home }).matchedSkills).toEqual(['apple-hig', 'design-taste'])
    expect(enrich(dir, 'wire the electron menu bar', { home }).matchedSkills).toEqual(['desktop-app', 'design-taste'])
    expect(enrich(dir, 'wire the electron auto-updater', { home }).matchedSkills).toEqual(['desktop-app'])
  })

  it('is shadowed by a project skill of the same name and disabled by bundled:false', () => {
    writeSkill('design-taste.md', '---\ntriggers: design\n---\nOur own house rules.')
    const shadowed = enrich(dir, 'design the header', { home })
    expect(shadowed.matchedSkills).toEqual(['design-taste'])
    expect(shadowed.sections).toContain('## Project notes: design-taste')
    expect(shadowed.sections).toContain('Our own house rules.')
    expect(shadowed.sections).not.toContain('## Design guidance')

    expect(enrich(dir, 'redesign the footer', { bundled: false, home }).sections).not.toContain('Design guidance')
  })
})

describe('enrich', () => {
  it('injects always-on rules plus matched skills as sections', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use pnpm, never npm.')
    writeSkill('auth.md', '---\ntriggers: auth\n---\nAuth flows live in src/auth.')

    const withMatch = plain('rework the auth screen')
    expect(withMatch.matchedSkills).toEqual(['auth'])
    expect(withMatch.sections).toContain('## Project rules (always apply)')
    expect(withMatch.sections).toContain('Use pnpm, never npm.')
    expect(withMatch.sections).toContain('## Project notes: auth')

    const noMatch = plain('change the footer')
    expect(noMatch.matchedSkills).toEqual([])
    expect(noMatch.sections).toContain('Project rules')
    expect(noMatch.sections).not.toContain('Project notes')

    expect(loadRules(os.tmpdir())).toBeNull()
    expect(enrich(os.tmpdir(), 'x', { bundled: false, home }).sections).toContain('Requesting visual approval')
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

    const enriched = plain('anything')
    expect(enriched.sections).toContain('Installed UI components')
    expect(enriched.sections).toContain('button · dialog')
    expect(enriched.sections).not.toContain('notes')
    expect(enriched.sections).toContain('shadcn@latest add')
  })

  it('injects locked paths as a hard constraint, skipping comments', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), '# do not touch\nsrc/legacy/**\npackage-lock.json\n\n')
    expect(loadLocks(dir)).toEqual(['src/legacy/**', 'package-lock.json'])
    const enriched = plain('anything')
    expect(enriched.sections).toContain('Locked files (hard constraint)')
    expect(enriched.sections).toContain('- src/legacy/**')
    expect(enriched.sections).toContain('stop and explain instead')
  })
})
