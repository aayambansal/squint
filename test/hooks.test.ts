import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runHook } from '../src/session/hooks.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-hooks-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('runHook', () => {
  it('fires an executable hook with SQUINT_* env and never throws otherwise', async () => {
    const hooksDir = path.join(dir, '.squint', 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })
    const marker = path.join(dir, 'hook-ran.txt')
    fs.writeFileSync(
      path.join(hooksDir, 'on-turn-end'),
      `#!/bin/sh\necho "$SQUINT_EVENT $SQUINT_COST $SQUINT_STAT" > ${marker}\n`,
    )
    fs.chmodSync(path.join(hooksDir, 'on-turn-end'), 0o755)

    expect(runHook(dir, 'on-turn-end', { cost: '0.42', stat: '3 files +10 −2' })).toBe(true)
    // Fire-and-forget means no completion signal; poll under suite load.
    const deadline = Date.now() + 5000
    while (!fs.existsSync(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(fs.readFileSync(marker, 'utf8').trim()).toBe('on-turn-end 0.42 3 files +10 −2')

    // Missing hook: silent no-op.
    expect(runHook(dir, 'on-budget', { total: '9' })).toBe(false)
    // Non-executable hook: silent no-op.
    fs.writeFileSync(path.join(hooksDir, 'on-problem'), '#!/bin/sh\n')
    fs.chmodSync(path.join(hooksDir, 'on-problem'), 0o644)
    expect(runHook(dir, 'on-problem', { source: 'gates' })).toBe(false)
  })
})
