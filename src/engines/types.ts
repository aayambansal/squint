/** Normalized event stream every engine adapter translates into. */
export type AgentEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; detail?: string }
  | {
      type: 'result'
      ok: boolean
      summary?: string
      sessionId?: string
      costUsd?: number
      durationMs?: number
    }
  | { type: 'error'; text: string }
  | { type: 'raw'; data: unknown }

export interface RunOptions {
  prompt: string
  cwd: string
  model?: string
  /** Session to resume, for engines that support it. */
  sessionId?: string
}

export interface Engine {
  id: string
  name: string
  /** Binary looked up on PATH. */
  binary: string
  /** How to install it, shown by `squint doctor`. */
  install: string
  supportsResume: boolean
  buildArgs(opts: RunOptions): string[]
  /**
   * Parse one stdout line into events. Engines that emit plain text leave
   * this undefined and the runner forwards lines as `text` events.
   */
  parseLine?(line: string): AgentEvent[]
}

export interface AgentResult {
  ok: boolean
  sessionId?: string
  costUsd?: number
  durationMs?: number
  error?: string
}
