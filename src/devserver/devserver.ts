import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { lineSplitter } from '../util/stream.js'
import { extractUrl, isErrorLine } from './errors.js'

export interface DevCommand {
  command: string
  args: string[]
  display: string
}

/**
 * Work out how to start this project's dev server: prefer the `dev` script,
 * fall back to `start`, and pick the package manager from the lockfile.
 */
export function detectDevCommand(cwd: string): DevCommand | null {
  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  } catch {
    return null
  }
  const script = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : null
  if (!script) return null

  const manager = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : fs.existsSync(path.join(cwd, 'yarn.lock'))
      ? 'yarn'
      : fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))
        ? 'bun'
        : 'npm'

  const args = manager === 'yarn' ? [script] : ['run', script]
  return { command: manager, args, display: `${manager} ${args.join(' ')}` }
}

interface CapturedLine {
  at: number
  text: string
  isError: boolean
}

export type DevServerState = 'stopped' | 'starting' | 'running' | 'crashed'

export interface DevServerCallbacks {
  onStateChange?(state: DevServerState): void
  onUrl?(url: string): void
}

const BUFFER_LIMIT = 400

/**
 * Owns the project's dev-server process: captures output into a ring
 * buffer, spots the announced local URL, and tags error lines so the
 * harness can feed fresh breakage back to the engine (Lovable's
 * "try to fix" loop).
 */
export class DevServer {
  private child: ChildProcess | null = null
  private lines: CapturedLine[] = []
  state: DevServerState = 'stopped'
  url: string | null = null

  constructor(
    private readonly cwd: string,
    private readonly callbacks: DevServerCallbacks = {},
  ) {}

  start(command?: DevCommand): boolean {
    if (this.child) return true
    const cmd = command ?? detectDevCommand(this.cwd)
    if (!cmd) return false

    this.setState('starting')
    this.lines = []
    this.url = null

    const child = spawn(cmd.command, cmd.args, {
      cwd: this.cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
    this.child = child

    const capture = (chunk: string) => splitter.push(chunk)
    const splitter = lineSplitter((line) => {
      const clean = line.replace(/\[[0-9;]*m/g, '')
      this.record(clean)
      if (!this.url) {
        const url = extractUrl(clean)
        if (url) {
          this.url = url
          this.setState('running')
          this.callbacks.onUrl?.(url)
        }
      }
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', capture)
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', capture)
    child.on('error', () => {
      this.child = null
      this.setState('crashed')
    })
    child.on('close', () => {
      this.child = null
      if (this.state !== 'stopped') this.setState('crashed')
    })
    return true
  }

  stop(): void {
    if (!this.child) return
    this.setState('stopped')
    this.child.kill('SIGTERM')
    this.child = null
  }

  /** Error lines captured after `since` (ms epoch), for fix-loop prompts. */
  errorsSince(since: number): string[] {
    return this.lines.filter((l) => l.isError && l.at >= since).map((l) => l.text)
  }

  /** Recent raw output, newest last — context for fix prompts. */
  tail(count: number): string[] {
    return this.lines.slice(-count).map((l) => l.text)
  }

  private record(text: string): void {
    this.lines.push({ at: Date.now(), text, isError: isErrorLine(text) })
    if (this.lines.length > BUFFER_LIMIT) this.lines.splice(0, this.lines.length - BUFFER_LIMIT)
  }

  private setState(state: DevServerState): void {
    this.state = state
    this.callbacks.onStateChange?.(state)
  }
}

/** The canned re-prompt sent back to the engine when the build breaks. */
export function buildFixPrompt(errors: string[], recentOutput: string[]): string {
  const errorBlock = errors.slice(-20).join('\n')
  const context = recentOutput.slice(-30).join('\n')
  return `The dev server reports errors after your last change. Diagnose and fix them. Do not paper over an error with try/catch — find the root cause.

## Dev server errors

${errorBlock}

## Recent dev server output

${context}`
}
