import { spawn } from 'node:child_process'
import { findBinary } from '../engines/registry.js'
import type { AgentEvent, AgentResult, Engine, RunOptions } from '../engines/types.js'
import { lineSplitter, truncate } from '../util/stream.js'

/**
 * Spawn an engine's CLI headlessly, translating its output into normalized
 * AgentEvents. Resolves with a result even when the process misbehaves —
 * callers never need try/catch for ordinary failures.
 */
export function runAgent(
  engine: Engine,
  opts: RunOptions,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const binaryPath = findBinary(engine.binary)
    if (!binaryPath) {
      const error = `${engine.name} not found on PATH. Install it: ${engine.install}`
      onEvent({ type: 'error', text: error })
      resolve({ ok: false, error })
      return
    }

    const startedAt = Date.now()
    let result: AgentResult | null = null
    let stderrTail = ''

    const child = spawn(binaryPath, engine.buildArgs(opts), {
      cwd: opts.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const emit = (event: AgentEvent) => {
      if (event.type === 'result') {
        result = {
          ok: event.ok,
          sessionId: event.sessionId,
          costUsd: event.costUsd,
          durationMs: event.durationMs,
        }
      }
      onEvent(event)
    }

    const stdout = lineSplitter((line) => {
      if (engine.parseLine) {
        for (const event of engine.parseLine(line)) emit(event)
      } else {
        emit({ type: 'text', text: line })
      }
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => stdout.push(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = truncate(stderrTail + chunk, 2000)
    })

    child.on('error', (err) => {
      const error = `Failed to start ${engine.name}: ${err.message}`
      onEvent({ type: 'error', text: error })
      resolve({ ok: false, error })
    })

    child.on('close', (code) => {
      stdout.flush()
      if (result) {
        resolve({ ...result, durationMs: result.durationMs ?? Date.now() - startedAt })
        return
      }
      if (code === 0) {
        // Plain-text engines finish without an explicit result event.
        resolve({ ok: true, durationMs: Date.now() - startedAt })
        return
      }
      const error = `${engine.name} exited with code ${code}${stderrTail ? `\n${stderrTail.trim()}` : ''}`
      onEvent({ type: 'error', text: error })
      resolve({ ok: false, error, durationMs: Date.now() - startedAt })
    })
  })
}
