import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { composePrompt, DEFAULT_BRIEF, FIRST_TURN_ADDENDUM, loadBrief } from '../src/prompt/brief.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-brief-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('composePrompt', () => {
  it('wraps the ask with the design brief and a task header', () => {
    const prompt = composePrompt('add a pricing page', { cwd: dir })
    expect(prompt).toContain(DEFAULT_BRIEF)
    expect(prompt).toContain('## Task')
    expect(prompt).toContain('add a pricing page')
  })

  it('passes the ask through untouched with noBrief', () => {
    expect(composePrompt('just this', { cwd: dir, noBrief: true })).toBe('just this')
  })

  it('adds the first-turn addendum by default and drops it for follow-ups', () => {
    expect(composePrompt('x', { cwd: dir })).toContain(FIRST_TURN_ADDENDUM)
    expect(composePrompt('x', { cwd: dir, firstTurn: false })).not.toContain(FIRST_TURN_ADDENDUM)
  })

  it('prefers a project brief at .squint/brief.md', () => {
    const briefPath = path.join(dir, '.squint', 'brief.md')
    fs.mkdirSync(path.dirname(briefPath), { recursive: true })
    fs.writeFileSync(briefPath, 'House style: brutalist, monochrome.')
    expect(loadBrief(dir)).toBe('House style: brutalist, monochrome.')
    expect(composePrompt('x', { cwd: dir })).toContain('brutalist')
  })

  it('falls back to the default brief when the project brief is empty', () => {
    const briefPath = path.join(dir, '.squint', 'brief.md')
    fs.mkdirSync(path.dirname(briefPath), { recursive: true })
    fs.writeFileSync(briefPath, '   \n')
    expect(loadBrief(dir)).toBe(DEFAULT_BRIEF)
  })
})
