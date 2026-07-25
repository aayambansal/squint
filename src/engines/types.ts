/** Normalized event stream every engine adapter translates into. */
export type AgentEvent =
  | { type: 'status'; text: string }
  /** Streaming fragment of in-progress assistant text. */
  | { type: 'delta'; text: string }
  /**
   * Complete assistant text block. `streamed` marks blocks whose content
   * already arrived as deltas, so renderers can dedupe.
   */
  | { type: 'text'; text: string; streamed?: boolean }
  | { type: 'thinking'; text: string }
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

/**
 * How much the engine may do: plan = read-only investigation,
 * safe = edits auto-approved inside the workspace (the default),
 * yolo = no approval friction at all.
 */
export type RunMode = 'plan' | 'safe' | 'yolo'

export interface RunOptions {
  prompt: string
  cwd: string
  model?: string
  mode?: RunMode
  /** Session to resume, for engines that support it. */
  sessionId?: string
}

/** Stateful per-run line parser: one instance per spawned process. */
export type LineParser = (line: string) => AgentEvent[]

export interface Engine {
  id: string
  name: string
  /** Binary looked up on PATH. */
  binary: string
  /** Alternate binary names to try when `binary` is absent. */
  altBinaries?: string[]
  /** How to install it, shown by `squint doctor`. */
  install: string
  supportsResume: boolean
  buildArgs(opts: RunOptions): string[]
  /**
   * Create a parser for one run. Engines that emit plain text leave this
   * undefined and the runner forwards stdout lines as `text` events.
   */
  createParser?(): LineParser
}

export interface AgentResult {
  ok: boolean
  sessionId?: string
  costUsd?: number
  durationMs?: number
  error?: string
}
