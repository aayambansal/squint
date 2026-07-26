import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectTailwindMajor, detectViteMajor, scanRulePacks } from '../src/quality/rulepacks.js'

let dir: string

function git(...argv: string[]): void {
  execFileSync('git', argv, { cwd: dir, stdio: 'ignore' })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-rules-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function commitBase(pkg: object): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
  fs.writeFileSync(path.join(dir, 'App.tsx'), 'export const App = () => <div className="p-4" />\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
}

describe('rule-packs', () => {
  it('detects majors from either dependency block', () => {
    commitBase({ devDependencies: { tailwindcss: '^4.1.0' }, dependencies: { vite: '~7.0.2' } })
    expect(detectTailwindMajor(dir)).toBe(4)
    expect(detectViteMajor(dir)).toBe(7)
    expect(detectTailwindMajor(os.tmpdir())).toBeNull()
  })

  it('infers v4 from the vite plugin when tailwindcss is transitive', () => {
    commitBase({ devDependencies: { '@tailwindcss/vite': '^4.0.0' } })
    expect(detectTailwindMajor(dir)).toBe(4)
  })

  it('flags v3-era classes added in a v4 project, hard vs soft', () => {
    commitBase({ devDependencies: { tailwindcss: '^4.1.0' } })
    fs.writeFileSync(
      path.join(dir, 'App.tsx'),
      'export const App = () => <div className="bg-gradient-to-r flex-shrink-0 overflow-ellipsis shadow-sm outline-none p-4" />\n',
    )
    const findings = scanRulePacks(dir, 'HEAD')
    const hard = findings.filter((f) => f.hard).map((f) => f.match)
    const soft = findings.filter((f) => !f.hard).map((f) => f.match)
    expect(hard).toEqual(['bg-gradient-to-r', 'flex-shrink-0', 'overflow-ellipsis'])
    expect(soft).toEqual(['shadow-sm', 'outline-none'])
    expect(findings.find((f) => f.match === 'bg-gradient-to-r')?.hint).toContain('bg-linear-to-r')
    expect(findings.find((f) => f.match === 'flex-shrink-0')?.hint).toContain('shrink-0')
  })

  it('flags a new tailwind.config in a v4 project (CSS-first)', () => {
    commitBase({ devDependencies: { tailwindcss: '^4.0.0' } })
    fs.writeFileSync(path.join(dir, 'tailwind.config.js'), 'module.exports = {}\n')
    git('add', '-A')
    const findings = scanRulePacks(dir, 'HEAD')
    expect(findings.some((f) => f.hint.includes('CSS-first'))).toBe(true)
  })

  it('scans vue and svelte single-file components too', () => {
    commitBase({ devDependencies: { tailwindcss: '^4.1.0' } })
    fs.writeFileSync(path.join(dir, 'Card.vue'), '<template><div class="bg-gradient-to-r p-2" /></template>\n')
    fs.writeFileSync(path.join(dir, 'Nav.svelte'), '<div class="flex-shrink-0" />\n')
    git('add', '-A')
    const matches = scanRulePacks(dir, 'HEAD').map((f) => `${f.file}:${f.match}`)
    expect(matches).toContain('Card.vue:bg-gradient-to-r')
    expect(matches).toContain('Nav.svelte:flex-shrink-0')
  })

  it('stays silent for v3 projects and unrelated files', () => {
    commitBase({ devDependencies: { tailwindcss: '^3.4.0' } })
    fs.writeFileSync(path.join(dir, 'App.tsx'), '<div className="bg-gradient-to-r shadow-sm" />\n')
    expect(scanRulePacks(dir, 'HEAD')).toEqual([])
  })

  it('scopes vite rules to vite.config and flags removed idioms', () => {
    commitBase({ devDependencies: { vite: '^7.0.0' } })
    fs.writeFileSync(path.join(dir, 'vite.config.ts'), 'import { splitVendorChunkPlugin } from "vite"\n')
    fs.writeFileSync(path.join(dir, 'App.tsx'), 'const splitVendorChunkPlugin = 1\n')
    git('add', '-A')
    const findings = scanRulePacks(dir, 'HEAD')
    expect(findings.length).toBe(1)
    expect(findings[0]?.file).toBe('vite.config.ts')
    expect(findings[0]?.hard).toBe(true)
  })
})
