import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findChrome, screenshot } from '../src/preview/chrome.js'
import { buildReviewPrompt, previewDir, VIEWPORTS } from '../src/preview/preview.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-preview-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('previewDir', () => {
  it('creates .squint/preview and keeps it out of git', () => {
    const preview = previewDir(dir)
    expect(fs.existsSync(preview)).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.squint', '.gitignore'), 'utf8')).toContain('preview/')
  })
})

describe('buildReviewPrompt', () => {
  it('lists shots and demands visible, ranked issues', () => {
    const prompt = buildReviewPrompt([
      { name: 'mobile', path: '/x/mobile.png' },
      { name: 'desktop', path: '/x/desktop.png' },
    ])
    expect(prompt).toContain('/x/mobile.png')
    expect(prompt).toContain('horizontal overflow')
    expect(prompt).toContain('issues you can SEE')
  })

  it('threads a focus area through when given', () => {
    expect(buildReviewPrompt([{ name: 'desktop', path: '/x/d.png' }], 'the pricing table')).toContain(
      'the pricing table',
    )
  })
})

describe('viewports', () => {
  it('covers the standard review trio', () => {
    expect(VIEWPORTS.map((v) => v.name)).toEqual(['mobile', 'tablet', 'desktop'])
  })
})

const chrome = findChrome()

describe.skipIf(!chrome)('screenshot (requires Chrome)', () => {
  it('captures a local html file to png', { timeout: 90000, retry: 2 }, async () => {
    const page = path.join(dir, 'page.html')
    fs.writeFileSync(page, '<!doctype html><body style="background:#123456"><h1>squint</h1></body>')
    const out = path.join(dir, 'shot.png')
    const result = await screenshot(chrome!, `file://${page}`, out, { width: 800, height: 600 })
    expect(result).toEqual({ ok: true })
    expect(fs.statSync(out).size).toBeGreaterThan(1000)
  })
})
