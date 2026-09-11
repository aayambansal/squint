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

  it('detects a prettier format gate, preferring a --check script', () => {
    writePkg({ scripts: { format: 'prettier --check .' } })
    expect(detectGates(dir).map((g) => g.id)).toEqual(['format'])
    // A write-mode format script must not become a gate; config fallback kicks in.
    writePkg({ scripts: { format: 'prettier --write .' } })
    expect(detectGates(dir)).toEqual([])
    fs.writeFileSync(path.join(dir, '.prettierrc'), '{}')
    const gates = detectGates(dir)
    expect(gates.map((g) => g.id)).toEqual(['format'])
    expect(gates[0]!.display).toBe('prettier --check .')
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

  it('detects a Playwright e2e gate last, preferring a project script, with a longer ceiling', () => {
    writePkg({ scripts: { build: 'vite build' }, devDependencies: { '@playwright/test': '^1.58' } })
    let gates = detectGates(dir)
    expect(gates.map((g) => g.id)).toEqual(['build', 'e2e'])
    expect(gates[1]!.display).toBe('playwright test')
    expect(gates[1]!.timeoutMs).toBeGreaterThan(5 * 60 * 1000)

    writePkg({ scripts: { 'test:e2e': 'playwright test --project=chromium' } })
    gates = detectGates(dir)
    expect(gates.map((g) => g.display)).toEqual(['npm run test:e2e'])

    // A config file alone is a signal; a non-playwright "e2e" script is not.
    writePkg({ scripts: { e2e: 'cypress run' } })
    expect(detectGates(dir)).toEqual([])
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), '')
    expect(detectGates(dir).map((g) => g.id)).toEqual(['e2e'])
  })

  it('honors SQUINT_SKIP_GATES', () => {
    writePkg({ scripts: { typecheck: 'tsc --noEmit', build: 'vite build' }, devDependencies: { '@playwright/test': '^1' } })
    const previous = process.env.SQUINT_SKIP_GATES
    process.env.SQUINT_SKIP_GATES = 'e2e, Build'
    try {
      expect(detectGates(dir).map((g) => g.id)).toEqual(['typecheck'])
    } finally {
      if (previous === undefined) delete process.env.SQUINT_SKIP_GATES
      else process.env.SQUINT_SKIP_GATES = previous
    }
  })
})

describe('buildGatePrompt', () => {
  const gate = { id: 'e2e', command: 'npx', args: ['playwright', 'test'], display: 'playwright test' }

  it('adds e2e discipline and names mechanical environment fixes', () => {
    const prompt = buildGatePrompt([
      { gate, ok: false, durationMs: 1, outputTail: "browserType.launch: Executable doesn't exist at /ms-playwright/chromium" },
    ])
    expect(prompt).toContain('fix the app first')
    expect(prompt).toContain('npx playwright install --with-deps chromium')
    expect(prompt).not.toContain('webServer')

    const refused = buildGatePrompt([{ gate, ok: false, durationMs: 1, outputTail: 'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/' }])
    expect(refused).toContain('configure `webServer`')

    const typecheck = buildGatePrompt([
      { gate: { id: 'typecheck', command: 'npx', args: ['tsc'], display: 'tsc --noEmit' }, ok: false, durationMs: 1, outputTail: 'error TS2322' },
    ])
    expect(typecheck).not.toContain('end-to-end')
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
