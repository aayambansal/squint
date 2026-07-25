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

  return gates
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
    }, GATE_TIMEOUT_MS)

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

export function buildGatePrompt(failures: GateResult[]): string {
  const sections = failures
    .map((f) => `### ${f.gate.id} (\`${f.gate.display}\`)\n\n${f.outputTail}`)
    .join('\n\n')
  return `Quality gates failed. Fix the underlying problems — do not weaken the checks, skip tests, or loosen compiler/lint settings to get green.

${sections}

After fixing, the failing commands above must pass.`
}
