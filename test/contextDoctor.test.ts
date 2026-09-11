import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contextReport, formatContextReport } from '../src/quality/contextDoctor.js'
import { appendDecision } from '../src/session/designLog.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-doctor-'))
  fs.mkdirSync(path.join(dir, '.squint', 'skills'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('context doctor', () => {
  it('itemizes every injection source with when it fires', () => {
    fs.writeFileSync(path.join(dir, '.squint', 'rules.md'), 'Use the token scale.')
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'auth.ts'), 'export {}')
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), 'src/auth.ts\n')
    fs.writeFileSync(
      path.join(dir, '.squint', 'skills', 'charts.md'),
      '---\ntriggers: chart, graph\n---\nUse the shared chart wrapper.',
    )
    appendDecision(dir, { decision: 'no purple', source: 'decide' })

    const report = contextReport(dir, { home: dir })
    const sources = report.lines.map((l) => l.source)
    expect(sources).toContain('brief (built-in)')
    expect(sources).toContain('rules (.squint/rules.md)')
    expect(sources).toContain('design ledger (1 recent decisions)')
    expect(sources).toContain('locks (1 paths)')
    expect(sources).toContain('skill: charts')
    expect(report.lines.find((l) => l.source === 'skill: charts')?.when).toContain('"chart"')
    expect(report.totalAlways).toBeGreaterThan(0)

    const text = formatContextReport(report)
    expect(text).toContain('always-on total')
  })

  it('warns on stale locks, generic triggers, and an oversized brief', () => {
    fs.writeFileSync(path.join(dir, '.squint', 'locks'), 'src/deleted.ts\n')
    fs.writeFileSync(path.join(dir, '.squint', 'skills', 'api.md'), '---\ntriggers: db\n---\nnotes')
    fs.writeFileSync(path.join(dir, '.squint', 'brief.md'), 'x'.repeat(6500))

    const { warnings } = contextReport(dir, { home: dir })
    expect(warnings.some((w) => w.includes('stale lock: src/deleted.ts'))).toBe(true)
    expect(warnings.some((w) => w.includes('"db"') && w.includes('api'))).toBe(true)
    expect(warnings.some((w) => w.includes('distill'))).toBe(true)
  })

  it('stays quiet on a bare project', () => {
    const report = contextReport(dir, { bundled: false, home: dir })
    expect(report.warnings).toEqual([])
    expect(report.lines.length).toBe(2) // the built-in brief + approval protocol
  })

  it('itemizes the bundled library with platform notes, shadowing, and external pointers', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-dom': '19' } }))
    fs.writeFileSync(path.join(dir, '.squint', 'skills', 'design-taste.md'), '---\ntriggers: design\n---\nhouse rules')
    const external = path.join(dir, '.claude', 'skills', 'impeccable')
    fs.mkdirSync(external, { recursive: true })
    fs.writeFileSync(path.join(external, 'SKILL.md'), '---\nname: impeccable\ndescription: craft\n---\nbody')

    const report = contextReport(dir, { home: dir })
    const line = (source: string) => report.lines.find((l) => l.source === source)
    expect(line('skill (bundled): apple-hig')?.note).toBe('ios not detected here')
    expect(line('skill (bundled): apple-hig')?.tokens).toBeGreaterThan(500)
    expect(line('skill (bundled): design-taste')?.when).toContain('shadowed by .squint/skills/design-taste.md')
    expect(line('skill (external): impeccable')?.when).toContain('"impeccable"')
    expect(formatContextReport(report)).toContain('(ios not detected here)')
    // Bundled skills are conditional, so they never count toward the always-on bill.
    expect(report.totalAlways).toBeLessThan(500)
  })
})
