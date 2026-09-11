import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Quality gates: the deterministic checks that close the agent loop.
 * Detected from the project, run fastest-first (typecheck → lint →
 * test → build), failures routed back to the engine as a fix prompt.
 */
export interface Gate {
  id: string
  command: string
  args: string[]
  display: string
  /** Per-gate ceiling; browser suites need more than compilers. */
  timeoutMs?: number
}

const PLAYWRIGHT_CONFIGS = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs']

/** Gate ids listed in SQUINT_SKIP_GATES (comma-separated) are never detected. */
function skippedGateIds(): Set<string> {
  return new Set(
    (process.env.SQUINT_SKIP_GATES ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  )
}

export interface GateResult {
  gate: Gate
  ok: boolean
  durationMs: number
  /** Last ~40 lines of combined output — the fix-prompt payload. */
  outputTail: string
}

export function detectGates(cwd: string): Gate[] {
  let pkg: { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  } catch {
    return []
  }
  const scripts = pkg.scripts ?? {}
  const gates: Gate[] = []

  const npmRun = (script: string): Pick<Gate, 'command' | 'args' | 'display'> => ({
    command: 'npm',
    args: ['run', script],
    display: `npm run ${script}`,
  })

  const hasTs =
    fs.existsSync(path.join(cwd, 'tsconfig.json')) ||
    Boolean(pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript)
  if (scripts.typecheck) {
    gates.push({ id: 'typecheck', ...npmRun('typecheck') })
  } else if (hasTs) {
    gates.push({ id: 'typecheck', command: 'npx', args: ['tsc', '--noEmit'], display: 'tsc --noEmit' })
  }

  const hasEslintConfig = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
  ].some((file) => fs.existsSync(path.join(cwd, file)))
  if (scripts.lint) {
    gates.push({ id: 'lint', ...npmRun('lint') })
  } else if (hasEslintConfig) {
    gates.push({ id: 'lint', command: 'npx', args: ['eslint', '.', '--max-warnings', '0'], display: 'eslint .' })
  }

  const hasPrettier = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    'prettier.config.js',
    'prettier.config.mjs',
  ].some((file) => fs.existsSync(path.join(cwd, file)))
  if (scripts.format && /--check|-c\b/.test(scripts.format)) {
    gates.push({ id: 'format', ...npmRun('format') })
  } else if (hasPrettier) {
    gates.push({ id: 'format', command: 'npx', args: ['prettier', '--check', '.'], display: 'prettier --check .' })
  }

  const testScript = scripts.test
  if (testScript && !/no test specified/i.test(testScript)) {
    gates.push({ id: 'test', ...npmRun('test') })
  }

  if (scripts.build) {
    gates.push({ id: 'build', ...npmRun('build') })
  }

  // Playwright end-to-end: the slowest gate, last. A project script that
  // mentions playwright wins; otherwise the presence of @playwright/test or
  // a playwright.config is enough. Needs the app reachable — webServer in
  // the config, or a dev server already running.
  const e2eScriptName = ['e2e', 'test:e2e', 'e2e:test', 'test:playwright'].find(
    (name) => scripts[name] && /playwright/.test(scripts[name]!),
  )
  const hasPlaywright =
    Boolean(pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test']) ||
    PLAYWRIGHT_CONFIGS.some((file) => fs.existsSync(path.join(cwd, file)))
  if (e2eScriptName) {
    gates.push({ id: 'e2e', ...npmRun(e2eScriptName), timeoutMs: E2E_TIMEOUT_MS })
  } else if (hasPlaywright) {
    gates.push({ id: 'e2e', command: 'npx', args: ['playwright', 'test'], display: 'playwright test', timeoutMs: E2E_TIMEOUT_MS })
  }

  const skipped = skippedGateIds()
  return skipped.size > 0 ? gates.filter((gate) => !skipped.has(gate.id)) : gates
}

/**
 * The inner-loop subset: deterministic, seconds-fast checks worth running
 * after every single turn (dyad runs exactly this pre-loop). Slow gates
 * (test, build) stay behind the explicit /check.
 */
export function detectFastGates(cwd: string): Gate[] {
  return detectGates(cwd).filter((gate) => gate.id === 'typecheck' || gate.id === 'lint')
}

const TAIL_LINES = 40
const GATE_TIMEOUT_MS = 5 * 60 * 1000
const E2E_TIMEOUT_MS = 15 * 60 * 1000

export function runGate(cwd: string, gate: Gate): Promise<GateResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let output = ''
    const child = spawn(gate.command, gate.args, {
      cwd,
      // CI collapses watch modes (vitest etc.) into single runs.
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const collect = (chunk: string) => {
      output += chunk
      if (output.length > 60000) output = output.slice(-60000)
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', collect)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', collect)

    const finish = (ok: boolean) => {
      clearTimeout(timer)
      const lines = output.split('\n').filter((line) => line.trim().length > 0)
      resolve({
        gate,
        ok,
        durationMs: Date.now() - startedAt,
        outputTail: lines.slice(-TAIL_LINES).join('\n'),
      })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      output += '\n[gate timed out]'
    }, gate.timeoutMs ?? GATE_TIMEOUT_MS)

    child.on('error', (err) => {
      output += `\n${err.message}`
      finish(false)
    })
    child.on('close', (code) => finish(code === 0))
  })
}

export async function runGates(
  cwd: string,
  gates: Gate[],
  onResult?: (result: GateResult) => void,
): Promise<GateResult[]> {
  const results: GateResult[] = []
  for (const gate of gates) {
    const result = await runGate(cwd, gate)
    results.push(result)
    onResult?.(result)
  }
  return results
}

/** Environment failures the engine can resolve mechanically, named. */
function e2eHints(outputTail: string): string {
  const hints: string[] = []
  if (/Executable doesn't exist|browserType\.launch/i.test(outputTail)) {
    hints.push('Browsers are missing: run `npx playwright install --with-deps chromium`.')
  }
  if (/ECONNREFUSED|net::ERR_CONNECTION_REFUSED|Timed out waiting .* from config\.webServer/i.test(outputTail)) {
    hints.push('The app was not reachable: configure `webServer` (command, url, reuseExistingServer) in playwright.config, or start the dev server.')
  }
  return hints.length > 0 ? `\n\n${hints.join('\n')}` : ''
}

export function buildGatePrompt(failures: GateResult[]): string {
  const sections = failures
    .map((f) => `### ${f.gate.id} (\`${f.gate.display}\`)\n\n${f.outputTail}${f.gate.id === 'e2e' ? e2eHints(f.outputTail) : ''}`)
    .join('\n\n')
  const e2e = failures.some((f) => f.gate.id === 'e2e')
    ? `\n\nA failing end-to-end test means a user journey broke: fix the app first. Change a test only if the requirement it encodes changed, and say so. Never widen a timeout, add a sleep, or mark a test skipped to get green.`
    : ''
  return `Quality gates failed. Fix the underlying problems — do not weaken the checks, skip tests, or loosen compiler/lint settings to get green.

${sections}${e2e}

After fixing, the failing commands above must pass.`
}
