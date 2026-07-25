import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearState, ensureSquintIgnore, loadState, saveState } from '../src/state/state.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-state-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('state', () => {
  it('round-trips and clears', () => {
    expect(loadState(dir)).toBeNull()
    saveState(dir, { engine: 'claude', sessionId: 's-1', model: 'claude-sonnet-5', lastAsk: 'build x', at: 123 })
    expect(loadState(dir)).toMatchObject({ engine: 'claude', sessionId: 's-1', lastAsk: 'build x' })
    clearState(dir)
    expect(loadState(dir)).toBeNull()
  })

  it('treats corrupt or partial state as absent', () => {
    fs.mkdirSync(path.join(dir, '.squint'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.squint', 'state.json'), '{broken')
    expect(loadState(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, '.squint', 'state.json'), JSON.stringify({ engine: 'claude' }))
    expect(loadState(dir)).toBeNull()
  })

  it('keeps working files gitignored without clobbering existing entries', () => {
    const ignore = path.join(dir, '.squint', '.gitignore')
    fs.mkdirSync(path.dirname(ignore), { recursive: true })
    fs.writeFileSync(ignore, 'preview/\ncustom/\n')
    ensureSquintIgnore(dir)
    const content = fs.readFileSync(ignore, 'utf8')
    expect(content).toContain('custom/')
    expect(content).toContain('state.json')
    expect(content.match(/preview\//g)?.length).toBe(1)
  })
})
