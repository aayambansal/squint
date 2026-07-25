import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildGatePrompt, detectGates, runGates } from '../src/gates/gates.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-gates-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function writePkg(value: unknown) {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(value))
}

describe('detectGates', () => {
  it('prefers project scripts and orders gates fastest-first', () => {
    writePkg({
      scripts: { typecheck: 'tsc --noEmit', lint: 'eslint .', test: 'vitest run', build: 'vite build' },
    })
    expect(detectGates(dir).map((g) => g.id)).toEqual(['typecheck', 'lint', 'test', 'build'])
  })

  it('falls back to tsc/eslint detection without scripts', () => {
    writePkg({ devDependencies: { typescript: '^5' } })
    fs.writeFileSync(path.join(dir, 'eslint.config.js'), '')
    const gates = detectGates(dir)
    expect(gates.map((g) => g.id)).toEqual(['typecheck', 'lint'])
    expect(gates[0]!.display).toBe('tsc --noEmit')
  })

  it('skips the npm placeholder test script and missing tools', () => {
    writePkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
    expect(detectGates(dir)).toEqual([])
  })

  it('returns empty without package.json', () => {
    expect(detectGates(dir)).toEqual([])
  })
})

describe('runGates', () => {
  it('runs real commands, captures failure output, and reports durations', { timeout: 30000 }, async () => {
    writePkg({
      scripts: {
        typecheck: 'node -e "console.log(String.fromCharCode(111)+String.fromCharCode(107))"',
        build: 'node -e "console.error(String.fromCharCode(98,97,100)); process.exit(1)"',
      },
    })
    const gates = detectGates(dir)
    const results = await runGates(dir, gates)
    expect(results.map((r) => [r.gate.id, r.ok])).toEqual([
      ['typecheck', true],
      ['build', false],
    ])
    expect(results[1]!.outputTail).toContain('bad')
    expect(results[0]!.durationMs).toBeGreaterThan(0)
  })
})

describe('buildGatePrompt', () => {
  it('names the failing gates and forbids weakening the checks', () => {
    const prompt = buildGatePrompt([
      {
        gate: { id: 'typecheck', command: 'npx', args: [], display: 'tsc --noEmit' },
        ok: false,
        durationMs: 100,
        outputTail: 'error TS2304: Cannot find name',
      },
    ])
    expect(prompt).toContain('tsc --noEmit')
    expect(prompt).toContain('error TS2304')
    expect(prompt).toContain('do not weaken the checks')
  })
})
