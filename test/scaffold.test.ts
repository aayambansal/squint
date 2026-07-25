import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeTemplate } from '../src/scaffold/init.js'
import { templateFiles } from '../src/scaffold/template.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-scaffold-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('templateFiles', () => {
  it('produces valid package.json with the expected stack', () => {
    const files = templateFiles('my-app')
    const pkg = JSON.parse(files['package.json']!)
    expect(pkg.name).toBe('my-app')
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.devDependencies.tailwindcss).toBeDefined()
    expect(pkg.devDependencies['@tailwindcss/vite']).toBeDefined()
    expect(pkg.scripts.dev).toBe('vite')
  })

  it('ships a starter flow so /flows works from birth', () => {
    const files = templateFiles('x')
    expect(files['.squint/flows/home.flow']).toContain('goto /')
    expect(files['.squint/flows/home.flow']).toContain('expect Ready')
  })

  it('keeps the design system token-first', () => {
    const files = templateFiles('x')
    expect(files['src/index.css']).toContain('@theme')
    expect(files['src/index.css']).toContain('--color-accent')
    // The starter app composes from tokens, not literal colors.
    expect(files['src/App.tsx']).toContain('bg-paper')
    expect(files['src/App.tsx']).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
})

describe('writeTemplate', () => {
  it('writes the full tree into an empty directory', () => {
    const target = path.join(dir, 'app')
    const result = writeTemplate(target)
    expect(result.files.length).toBeGreaterThanOrEqual(7)
    expect(fs.existsSync(path.join(target, 'src/main.tsx'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).name).toBe('app')
  })

  it('sanitizes awkward directory names', () => {
    const target = path.join(dir, 'My Cool App!!')
    writeTemplate(target)
    expect(JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).name).toBe('my-cool-app')
  })

  it('refuses a non-empty directory without force, tolerating dotfiles', () => {
    const target = path.join(dir, 'busy')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, '.gitkeep'), '')
    expect(() => writeTemplate(target)).not.toThrow()

    const target2 = path.join(dir, 'busy2')
    fs.mkdirSync(target2)
    fs.writeFileSync(path.join(target2, 'notes.txt'), 'x')
    expect(() => writeTemplate(target2)).toThrow(/not empty/)
    expect(() => writeTemplate(target2, { force: true })).not.toThrow()
  })
})
