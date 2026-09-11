import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { composePrompt, DEFAULT_BRIEF, FIRST_TURN_ADDENDUM, loadBrief, placeBrief } from '../src/prompt/brief.js'

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

describe('placeBrief', () => {
  const cold = { supportsResume: false }
  const resumable = { supportsResume: true }
  const withSystem = { supportsResume: true, supportsSystemPrompt: true }

  it('puts the brief in the system prompt on every turn for engines that take one', () => {
    const first = placeBrief(withSystem, 'add a pricing page', { cwd: dir, sessionStarted: false, firstAsk: true })
    expect(first.systemPrompt).toBe(DEFAULT_BRIEF)
    expect(first.prompt).not.toContain(DEFAULT_BRIEF)
    expect(first.prompt).toContain(FIRST_TURN_ADDENDUM)
    expect(first.prompt).toContain('## Task\n\nadd a pricing page')

    const later = placeBrief(withSystem, 'fix the footer', { cwd: dir, sessionStarted: true, firstAsk: false })
    expect(later.systemPrompt).toBe(DEFAULT_BRIEF)
    expect(later.prompt).toBe('fix the footer')
  })

  it('inlines the brief once for resumable engines, then sends raw asks', () => {
    const first = placeBrief(resumable, 'add a pricing page', { cwd: dir, sessionStarted: false, firstAsk: true })
    expect(first.systemPrompt).toBeUndefined()
    expect(first.prompt).toContain(DEFAULT_BRIEF)
    expect(first.prompt).toContain(FIRST_TURN_ADDENDUM)

    const later = placeBrief(resumable, 'fix the footer', { cwd: dir, sessionStarted: true, firstAsk: false })
    expect(later.prompt).toBe('fix the footer')
    // A review before the first ask already carried the brief; the opening ask still gets the addendum.
    const askAfterReview = placeBrief(resumable, 'build it', { cwd: dir, sessionStarted: true, firstAsk: true })
    expect(askAfterReview.prompt).not.toContain(DEFAULT_BRIEF)
    expect(askAfterReview.prompt).toContain(FIRST_TURN_ADDENDUM)
  })

  it('inlines the brief on every turn for cold engines, with the addendum only on the opening ask', () => {
    const first = placeBrief(cold, 'add a pricing page', { cwd: dir, sessionStarted: false, firstAsk: true })
    expect(first.prompt).toContain(DEFAULT_BRIEF)
    expect(first.prompt).toContain(FIRST_TURN_ADDENDUM)
    const fix = placeBrief(cold, 'Quality gates failed…', { cwd: dir, sessionStarted: false, firstAsk: false })
    expect(fix.prompt).toContain(DEFAULT_BRIEF)
    expect(fix.prompt).not.toContain(FIRST_TURN_ADDENDUM)
    expect(fix.prompt).toContain('## Task\n\nQuality gates failed…')
  })

  it('honors noBrief', () => {
    expect(placeBrief(withSystem, 'x', { cwd: dir, sessionStarted: false, firstAsk: true, noBrief: true })).toEqual({ prompt: 'x' })
  })
})
