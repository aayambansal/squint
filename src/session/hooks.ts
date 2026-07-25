import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Harness hooks: executables in .squint/hooks/ named by event, fired
 * with SQUINT_* env vars. Fire-and-forget with a hard cap — hooks can
 * notify, log, or trigger CI, but they can never block or break a turn.
 * squint's hooks fire on quality events no engine emits: pulse diffs,
 * problems, budget crossings.
 */
export type HookEvent = 'on-turn-end' | 'on-pulse-diff' | 'on-problem' | 'on-budget'

export function runHook(cwd: string, event: HookEvent, payload: Record<string, string>): boolean {
  const script = path.join(cwd, '.squint', 'hooks', event)
  try {
    fs.accessSync(script, fs.constants.X_OK)
  } catch {
    return false
  }
  try {
    const child = spawn(script, [], {
      cwd,
      env: { ...process.env, SQUINT_EVENT: event, ...prefixed(payload) },
      stdio: 'ignore',
      detached: false,
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
    child.on('close', () => clearTimeout(timer))
    child.on('error', () => clearTimeout(timer))
    return true
  } catch {
    return false
  }
}

function prefixed(payload: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    out[`SQUINT_${key.toUpperCase()}`] = value
  }
  return out
}
