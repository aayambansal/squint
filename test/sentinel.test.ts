import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanEvasion, sentinelSummary } from '../src/quality/sentinel.js'

let dir: string

function git(...argv: string[]): void {
  execFileSync('git', argv, { cwd: dir, stdio: 'ignore' })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-sentinel-'))
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, '.squint', 'checks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'app.test.ts'), "it('works', () => {})\n")
  fs.writeFileSync(path.join(dir, 'app.ts'), 'export const x = 1\n')
  fs.writeFileSync(
    path.join(dir, '.squint', 'checks', 'cta.js'),
    '(() => [document.querySelector(".cta") ? "" : "no cta"].filter(Boolean))()\nconst strict = 1\nconst alsoStrict = 2\n',
  )
  fs.writeFileSync(path.join(dir, '.squint', 'locks'), 'src/legacy/**\nconfig.yaml\n')
  fs.mkdirSync(path.join(dir, 'src', 'legacy'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'legacy', 'old.ts'), 'export {}\n')
  fs.writeFileSync(path.join(dir, 'config.yaml'), 'a: 1\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('the sentinel', () => {
  it('flags deleted tests, skips, suppressions, weakened checks, and lock touches', () => {
    fs.rmSync(path.join(dir, 'app.test.ts'))
    fs.writeFileSync(path.join(dir, 'other.spec.ts'), "it.skip('used to fail', () => {})\n")
    fs.writeFileSync(path.join(dir, 'app.ts'), '// @ts-ignore\nexport const x: number = "1"\n')
    fs.writeFileSync(path.join(dir, '.squint', 'checks', 'cta.js'), '(() => [])()\n')
    fs.writeFileSync(path.join(dir, 'src', 'legacy', 'old.ts'), 'export const changed = 1\n')
    fs.writeFileSync(path.join(dir, 'config.yaml'), 'a: 2\n')
    git('add', '-A')

    const findings = scanEvasion(dir, 'HEAD')
    const kinds = findings.map((f) => `${f.kind}:${f.file}`)
    expect(kinds).toContain('test-deleted:app.test.ts')
    expect(kinds).toContain('test-skipped:other.spec.ts')
    expect(kinds).toContain('suppression:app.ts')
    expect(kinds).toContain('check-weakened:.squint/checks/cta.js')
    expect(kinds).toContain('lock-touched:src/legacy/old.ts')
    expect(kinds).toContain('lock-touched:config.yaml')

    const summary = sentinelSummary(findings)
    expect(summary).toContain('[test-deleted] app.test.ts')
    expect(summary).toContain('assertions removed')
  })

  it('stays silent on honest work', () => {
    fs.writeFileSync(path.join(dir, 'app.ts'), 'export const x = 2\nexport const y = 3\n')
    fs.writeFileSync(path.join(dir, 'new.test.ts'), "it('more coverage', () => {})\n")
    fs.writeFileSync(
      path.join(dir, '.squint', 'checks', 'nav.js'),
      '(() => [document.querySelector("nav") ? "" : "no nav"].filter(Boolean))()\n',
    )
    git('add', '-A')
    expect(scanEvasion(dir, 'HEAD')).toEqual([])
  })

  it('growing a check is not weakening it', () => {
    fs.appendFileSync(path.join(dir, '.squint', 'checks', 'cta.js'), 'const stricter = 3\n')
    git('add', '-A')
    expect(scanEvasion(dir, 'HEAD')).toEqual([])
  })
})

describe('lock glob matching', () => {
  it('matches nested paths under ** and exact files, not siblings', () => {
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), 'src/legacy/**\n')
    fs.mkdirSync(path.join(dir, 'src', 'legacy', 'deep'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'legacy', 'deep', 'nested.ts'), 'export {}\n')
    fs.writeFileSync(path.join(dir, 'src', 'modern.ts'), 'export {}\n')
    git('add', '-A')
    git('commit', '-qm', 'setup')

    fs.writeFileSync(path.join(dir, 'src', 'legacy', 'deep', 'nested.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(dir, 'src', 'modern.ts'), 'export const b = 2\n')
    git('add', '-A')

    const findings = scanEvasion(dir, 'HEAD')
    const locked = findings.filter((f) => f.kind === 'lock-touched').map((f) => f.file)
    expect(locked).toEqual(['src/legacy/deep/nested.ts'])
  })
})

describe('rules.md weakening', () => {
  it('flags shrunken or deleted standing rules, ignores growth', () => {
    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use tokens.\nKeyboard reachable.\nNo purple.\n')
    git('add', '-A')
    git('commit', '-qm', 'rules')

    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use tokens.\n')
    git('add', '-A')
    const shrunk = scanEvasion(dir, 'HEAD')
    expect(shrunk.some((f) => f.kind === 'check-weakened' && f.file === '.squint/rules.md' && f.detail.includes('standing rules deleted'))).toBe(true)

    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use tokens.\nKeyboard reachable.\nNo purple.\nAlso: motion respects reduced-motion.\n')
    git('add', '-A')
    expect(scanEvasion(dir, 'HEAD').some((f) => f.file === '.squint/rules.md')).toBe(false)
  })
})
