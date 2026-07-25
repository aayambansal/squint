import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { driftSummary, loadTokenIndex, parseHex, scanDrift } from '../src/quality/tokens.js'
import { takeSnapshot } from '../src/vcs/snapshot.js'

let dir: string

function git(...args: string[]) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-tokens-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('parseHex', () => {
  it('handles long and short forms', () => {
    expect(parseHex('#ff0000')).toEqual([255, 0, 0])
    expect(parseHex('#0f0')).toEqual([0, 255, 0])
    expect(parseHex('#zzz')).toBeNull()
  })
})

describe('loadTokenIndex', () => {
  it('indexes color custom properties from css files', () => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'index.css'),
      '@theme {\n  --color-accent: #e8a33d;\n  --color-ink: rgb(30, 32, 40);\n  --font-body: sans-serif;\n}\n',
    )
    const index = loadTokenIndex(dir)
    expect(index.colors.get('--color-accent')?.rgb).toEqual([232, 163, 61])
    expect(index.colors.get('--color-ink')?.rgb).toEqual([30, 32, 40])
    expect(index.colors.has('--font-body')).toBe(false)
  })
})

describe('scanDrift', () => {
  it('flags hardcoded colors added since the snapshot, naming the nearest token', () => {
    git('init', '-q')
    git('config', 'user.email', 't@e.com')
    git('config', 'user.name', 'T')
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'index.css'), ':root {\n  --color-accent: #e8a33d;\n}\n')
    fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const A = 1\n')
    git('add', '-A')
    git('commit', '-qm', 'base')

    const index = loadTokenIndex(dir)
    const snapshot = takeSnapshot(dir)!

    // The "turn": adds a hardcoded near-accent color and a new token def.
    fs.writeFileSync(
      path.join(dir, 'src', 'App.tsx'),
      'export const A = <div style={{ color: "#e8a340" }} />\n',
    )
    fs.appendFileSync(path.join(dir, 'src', 'index.css'), '  --color-new: #123456;\n')

    const drift = scanDrift(dir, snapshot.stashHash ?? 'HEAD', index)
    expect(drift.length).toBe(1) // the token definition line is exempt
    expect(drift[0]).toMatchObject({ literal: '#e8a340', token: '--color-accent' })
    expect(drift[0]!.distance).toBeLessThan(8)
    expect(driftSummary(drift)).toContain('use var(--color-accent)')
  })

  it('stays silent without tokens or without additions', () => {
    git('init', '-q')
    git('config', 'user.email', 't@e.com')
    git('config', 'user.name', 'T')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n')
    git('add', '-A')
    git('commit', '-qm', 'base')
    const snapshot = takeSnapshot(dir)!
    expect(scanDrift(dir, snapshot.stashHash ?? 'HEAD', loadTokenIndex(dir))).toEqual([])
  })
})
