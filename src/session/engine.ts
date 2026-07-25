import path from 'node:path'
import { buildFixPrompt, DevServer, type DevServerState, detectDevCommand } from '../devserver/devserver.js'
import { getEngine } from '../engines/registry.js'
import type { AgentEvent } from '../engines/types.js'
import { buildGatePrompt, detectFastGates, detectGates, runGates } from '../gates/gates.js'
import {
  buildReviewPrompt,
  buildRuntimeFixPrompt,
  type CaptureResult,
  captureViewports,
  probeRuntime,
  runtimeSummary,
} from '../preview/preview.js'
import { composePrompt } from '../prompt/brief.js'
import { runAgent } from '../runner/run.js'
import { clearState, loadState, saveState } from '../state/state.js'
import { restoreSnapshot, type Snapshot, takeSnapshot } from '../vcs/snapshot.js'

export type TranscriptRole = 'user' | 'assistant' | 'status' | 'tool' | 'error' | 'thinking'

export interface TranscriptItem {
  id: number
  role: TranscriptRole
  text: string
}

export interface SessionTotals {
  costUsd: number
  turns: number
}

export interface SessionState {
  items: TranscriptItem[]
  liveText: string
  running: boolean
  runStartedAt: number
  engineId: string
  model?: string
  devState: DevServerState
  devUrl: string | null
  totals: SessionTotals
  /** Asks typed while a turn runs; dispatched in order afterward. */
  queue: string[]
}

export interface SessionOptions {
  cwd: string
  engineId: string
  model?: string
  autoDev?: boolean
  autoFix?: boolean
  autoProbe?: boolean
  /** Run typecheck+lint after every turn (default on where detected). */
  autoCheck?: boolean
  /** Called when a /quit-style command asks the frontend to close. */
  onQuit?: () => void
}

const MAX_AUTO_FIX_ATTEMPTS = 2

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The harness core: owns the transcript, turn orchestration, the
 * dev-server/probe fix loop, and every slash command. Framework-free —
 * frontends subscribe and render. This is the piece the TUI, headless
 * runs, and tests all share.
 */
export class Session {
  private state: SessionState
  private listeners = new Set<() => void>()
  private nextId = 0
  private live = ''
  private sessionId: string | undefined
  private dev: DevServer | null = null
  private abort: AbortController | null = null
  private pendingFix: { prompt: string; display: string } | null = null
  private checkpoints: Array<{ snapshot: Snapshot; label: string; at: number }> = []
  private fixAttempts = 0
  private reviewTipShown = false
  private readonly startedAt = Date.now()

  constructor(private readonly opts: SessionOptions) {
    this.state = {
      items: [],
      liveText: '',
      running: false,
      runStartedAt: 0,
      engineId: opts.engineId,
      model: opts.model,
      devState: 'stopped',
      devUrl: null,
      totals: { costUsd: 0, turns: 0 },
      queue: [],
    }
    if (opts.autoDev && detectDevCommand(opts.cwd)) {
      this.devServer().start()
    }
    const saved = loadState(opts.cwd)
    if (saved) {
      try {
        if (getEngine(saved.engine).supportsResume) {
          const mins = Math.max(1, Math.round((Date.now() - saved.at) / 60000))
          this.push(
            'status',
            `previous session (${mins}m ago${saved.lastAsk ? ` · "${saved.lastAsk}"` : ''}) — /resume to continue`,
          )
        }
      } catch {
        // engine no longer exists; ignore stale state
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): SessionState {
    return this.state
  }

  dispose(): void {
    this.abort?.abort()
    this.dev?.stop()
  }

  interrupt(): void {
    this.abort?.abort()
  }

  /** Frontend-originated status line (view-level commands like /theme). */
  note(text: string): void {
    this.push('status', text)
  }

  /** One-line goodbye: what this session amounted to. */
  summary(): string {
    const mins = Math.max(1, Math.round((Date.now() - this.startedAt) / 60000))
    const { turns, costUsd } = this.state.totals
    const parts = [`${turns} turn${turns === 1 ? '' : 's'}`]
    if (costUsd > 0) parts.push(`$${costUsd.toFixed(2)}`)
    parts.push(`${mins}m`)
    return `session: ${parts.join(' · ')}`
  }

  /**
   * Route one line of user input: slash command or an ask for the engine.
   * Asks arriving mid-turn queue up and dispatch in order once the
   * current turn (including its fix cycle) settles.
   */
  input(raw: string): void {
    const value = raw.trim()
    if (value.length === 0) return
    if (this.state.running) {
      if (value === '/queue clear') {
        this.notify({ queue: [] })
        this.push('status', 'queue cleared')
        return
      }
      this.notify({ queue: [...this.state.queue, value] })
      return
    }
    if (value.startsWith('/')) {
      this.command(value)
    } else {
      void this.submit(value)
    }
  }

  /** Dispatch queued input after the current work settles. */
  private drainQueue(): void {
    if (this.state.running) return
    const [next, ...rest] = this.state.queue
    if (next === undefined) return
    this.notify({ queue: rest })
    this.input(next)
  }

  // ---------- internals ----------

  private notify(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private push(role: TranscriptRole, text: string): void {
    this.nextId += 1
    this.notify({ items: [...this.state.items, { id: this.nextId, role, text }] })
  }

  private setLive(text: string): void {
    this.live = text
    this.notify({ liveText: text })
  }

  /**
   * Static transcript items are immutable once rendered, so in-progress
   * assistant text accumulates in a live buffer and commits as one block.
   */
  private commitLive(): void {
    if (this.live.length > 0) {
      const text = this.live
      this.live = ''
      this.state = { ...this.state, liveText: '' }
      this.push('assistant', text)
    }
  }

  private devServer(): DevServer {
    if (!this.dev) {
      this.dev = new DevServer(this.opts.cwd, {
        onStateChange: (devState) => this.notify({ devState }),
        onUrl: (url) => this.notify({ devUrl: url }),
      })
    }
    return this.dev
  }

  private handleEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case 'status':
        this.commitLive()
        this.push('status', event.text)
        break
      case 'delta':
        this.setLive(this.live + event.text)
        break
      case 'text':
        if (event.streamed) {
          this.live = ''
          this.state = { ...this.state, liveText: '' }
          this.push('assistant', event.text)
        } else {
          this.setLive(this.live + (this.live.length > 0 ? '\n' : '') + event.text)
        }
        break
      case 'thinking':
        this.commitLive()
        this.push('thinking', event.text)
        break
      case 'tool':
        this.commitLive()
        this.push('tool', event.detail ? `${event.name} · ${event.detail}` : event.name)
        break
      case 'error':
        this.commitLive()
        this.push('error', event.text)
        break
      case 'result':
        if (event.sessionId) this.sessionId = event.sessionId
        break
      case 'raw':
        break
    }
  }

  /** Run one engine turn. `display` is what the transcript shows as the ask. */
  private async runTurn(prompt: string, display: string): Promise<void> {
    this.push('user', display)
    this.notify({ running: true, runStartedAt: Date.now() })
    const runStart = Date.now()
    const engine = getEngine(this.state.engineId)
    this.abort = new AbortController()
    const result = await runAgent(
      engine,
      {
        prompt,
        cwd: this.opts.cwd,
        model: this.state.model,
        sessionId: engine.supportsResume ? this.sessionId : undefined,
      },
      this.handleEvent,
      this.abort.signal,
    )
    this.abort = null
    this.commitLive()
    if (result.ok) {
      const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
      const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
      this.push('status', `done${secs}${cost}`)
      this.notify({
        totals: {
          costUsd: this.state.totals.costUsd + (result.costUsd ?? 0),
          turns: this.state.totals.turns + 1,
        },
      })
      if (this.sessionId) {
        saveState(this.opts.cwd, {
          engine: this.state.engineId,
          sessionId: this.sessionId,
          model: this.state.model,
          lastAsk: display.length > 80 ? `${display.slice(0, 79)}…` : display,
          at: Date.now(),
        })
      }
    }

    // Fastest verifier first: deterministic compile/lint checks on every
    // turn (the dyad pre-loop), before any browser-level feedback.
    if (result.ok && this.opts.autoCheck !== false) {
      const fastGates = detectFastGates(this.opts.cwd)
      if (fastGates.length > 0) {
        const gateResults = await runGates(this.opts.cwd, fastGates)
        const failures = gateResults.filter((r) => !r.ok)
        if (failures.length > 0) {
          this.pendingFix = {
            prompt: buildGatePrompt(failures),
            display: `⛑ fix ${failures.map((f) => f.gate.id).join(' + ')} errors`,
          }
          this.push(
            'error',
            failures.map((f) => `✗ ${f.gate.id} · ${f.outputTail.split('\n').slice(-3).join('\n')}`).join('\n'),
          )
          if (this.opts.autoFix && this.fixAttempts < MAX_AUTO_FIX_ATTEMPTS) {
            this.fixAttempts += 1
            this.push('status', `auto-fix attempt ${this.fixAttempts}/${MAX_AUTO_FIX_ATTEMPTS}`)
            this.notify({ running: false })
            await this.runTurn(this.pendingFix.prompt, this.pendingFix.display)
            return
          }
          this.push('status', 'type /fix to send them to the engine')
          this.notify({ running: false })
          this.drainQueue()
          return
        }
      }
    }

    // The Lovable loop: give the dev server a moment to rebuild, then
    // sweep for fresh errors and route them back to the engine.
    const dev = this.dev
    if (result.error !== 'interrupted' && dev && (dev.state === 'running' || dev.state === 'starting')) {
      await delay(1500)
      const errors = dev.errorsSince(runStart)
      if (errors.length > 0) {
        this.pendingFix = {
          prompt: buildFixPrompt(errors, dev.tail(30)),
          display: '⛑ fix dev server errors',
        }
        this.push('error', `dev server: ${errors.length} error line(s)\n${errors.slice(-5).join('\n')}`)
        if (this.opts.autoFix && this.fixAttempts < MAX_AUTO_FIX_ATTEMPTS) {
          this.fixAttempts += 1
          this.push('status', `auto-fix attempt ${this.fixAttempts}/${MAX_AUTO_FIX_ATTEMPTS}`)
          this.notify({ running: false })
          await this.runTurn(this.pendingFix.prompt, this.pendingFix.display)
          return
        }
        this.push('status', 'type /fix to send them to the engine')
      } else {
        this.pendingFix = null
        // Build output is clean — probe the page itself for client-side
        // breakage the server never sees (blank page, exceptions, 404s).
        if (this.opts.autoProbe !== false && this.state.devUrl) {
          const report = await probeRuntime(this.state.devUrl)
          const summary = report ? runtimeSummary(report) : null
          if (report && summary) {
            this.pendingFix = {
              prompt: buildRuntimeFixPrompt(report),
              display: '⛑ fix runtime errors',
            }
            this.push('error', `runtime: ${summary}`)
            if (this.opts.autoFix && this.fixAttempts < MAX_AUTO_FIX_ATTEMPTS) {
              this.fixAttempts += 1
              this.push('status', `auto-fix attempt ${this.fixAttempts}/${MAX_AUTO_FIX_ATTEMPTS}`)
              this.notify({ running: false })
              await this.runTurn(this.pendingFix.prompt, this.pendingFix.display)
              return
            }
            this.push('status', 'type /fix to send them to the engine')
          }
        }
        if (!this.reviewTipShown && this.state.devUrl) {
          this.reviewTipShown = true
          this.push('status', 'tip: /review screenshots the app and has the engine critique its own work')
        }
      }
    }
    this.notify({ running: false })
    this.drainQueue()
  }

  async submit(ask: string): Promise<void> {
    this.fixAttempts = 0
    // Checkpoint per ask: the snapshot covers this turn plus its fixes.
    const snapshot = takeSnapshot(this.opts.cwd)
    if (snapshot) {
      this.checkpoints.push({
        snapshot,
        label: ask.length > 60 ? `${ask.slice(0, 59)}…` : ask,
        at: Date.now(),
      })
      if (this.checkpoints.length > 20) this.checkpoints.shift()
    }
    // Resumable engines keep the brief in session context, so follow-up
    // turns send the raw ask; non-resumable engines get it every turn.
    const isFirstTurn = this.sessionId === undefined
    const prompt = isFirstTurn ? composePrompt(ask, { cwd: this.opts.cwd, firstTurn: true }) : ask
    await this.runTurn(prompt, ask)
  }

  /** Restore files to the state before checkpoint `index`; drop it and everything after. */
  private restoreTo(index: number): void {
    const checkpoint = this.checkpoints[index]
    if (!checkpoint) {
      this.push('status', 'no such checkpoint — /checkpoints lists them')
      return
    }
    const result = restoreSnapshot(this.opts.cwd, checkpoint.snapshot)
    if (result.restored) {
      const dropped = this.checkpoints.length - index
      this.checkpoints = this.checkpoints.slice(0, index)
      this.push(
        'status',
        `restored files to before "${checkpoint.label}"${
          dropped > 1 ? ` · ${dropped} asks rolled back` : ''
        }${result.deletedFiles > 0 ? ` · removed ${result.deletedFiles} created file(s)` : ''} — the conversation continues from here`,
      )
    } else {
      this.push('error', `restore failed: ${result.detail ?? 'unknown error'}`)
    }
  }

  /** Screenshot the running app (and watch its runtime where CDP is available). */
  private async capture(): Promise<CaptureResult | null> {
    if (!this.state.devUrl) {
      this.push('error', 'dev server not running — /dev first')
      return null
    }
    this.push('status', 'capturing screenshots…')
    const result = await captureViewports(this.opts.cwd, this.state.devUrl)
    if (!result) {
      this.push('error', 'no Chrome/Chromium found for screenshots')
      return null
    }
    for (const err of result.errors) this.push('error', `screenshot ${err}`)
    if (result.shots.length > 0) {
      this.push(
        'status',
        `captured ${result.shots.map((s) => s.name).join(', ')} → ${path.dirname(result.shots[0]!.path)}`,
      )
    }
    if (result.runtime) {
      const summary = runtimeSummary(result.runtime)
      if (summary) {
        this.push('error', `runtime: ${summary}`)
        this.pendingFix = { prompt: buildRuntimeFixPrompt(result.runtime), display: '⛑ fix runtime errors' }
        this.push('status', 'type /fix to send them to the engine')
      } else {
        this.push('status', 'runtime clean — no console errors, exceptions, or failed requests')
      }
    }
    if (result.a11y && result.a11y.length > 0) {
      this.push('error', `a11y: ${result.a11y.length} finding(s)\n${result.a11y.slice(0, 5).join('\n')}`)
      this.push('status', '/review folds these into the fix pass')
    }
    return result.shots.length > 0 ? result : null
  }

  command(commandLine: string): void {
    const [name, ...rest] = commandLine.slice(1).split(/\s+/)
    const arg = rest.join(' ').trim()
    switch (name) {
      case 'engine':
        if (!arg) {
          this.push('status', 'usage: /engine <id> — see squint engines')
        } else {
          try {
            getEngine(arg)
            this.sessionId = undefined
            this.notify({ engineId: arg })
            this.push('status', `engine → ${arg} (new session)`)
          } catch (err) {
            this.push('error', err instanceof Error ? err.message : String(err))
          }
        }
        break
      case 'model':
        this.notify({ model: arg || undefined })
        this.push('status', arg ? `model → ${arg}` : 'model → engine default')
        break
      case 'dev': {
        const dev = this.devServer()
        if (dev.state === 'stopped' || dev.state === 'crashed') {
          const devCommand = detectDevCommand(this.opts.cwd)
          if (!devCommand) {
            this.push('error', 'no dev/start script found in package.json')
          } else {
            dev.start(devCommand)
            this.push('status', `dev server starting · ${devCommand.display}`)
          }
        } else {
          dev.stop()
          this.notify({ devUrl: null })
          this.push('status', 'dev server stopped')
        }
        break
      }
      case 'fix':
        if (!this.pendingFix) {
          this.push('status', 'nothing to fix — no captured errors or failed gates')
        } else {
          void this.runTurn(this.pendingFix.prompt, this.pendingFix.display)
        }
        break
      case 'check':
        void (async () => {
          const gates = detectGates(this.opts.cwd)
          if (gates.length === 0) {
            this.push('status', 'no gates detected in this project')
            return
          }
          this.push('status', `running gates: ${gates.map((g) => g.id).join(' → ')}`)
          this.notify({ running: true, runStartedAt: Date.now() })
          const results = await runGates(this.opts.cwd, gates, (result) => {
            this.push(
              result.ok ? 'status' : 'error',
              `${result.ok ? '✓' : '✗'} ${result.gate.id} · ${(result.durationMs / 1000).toFixed(1)}s`,
            )
          })
          this.notify({ running: false })
          this.drainQueue()
          const failures = results.filter((r) => !r.ok)
          if (failures.length > 0) {
            this.pendingFix = {
              prompt: buildGatePrompt(failures),
              display: `⛑ fix failing gates: ${failures.map((f) => f.gate.id).join(', ')}`,
            }
            this.push('status', 'type /fix to send failures to the engine')
          } else {
            this.push('status', 'all gates passed')
          }
        })()
        break
      case 'shot':
        void this.capture()
        break
      case 'review':
        void (async () => {
          const result = await this.capture()
          if (result) {
            await this.runTurn(
              buildReviewPrompt(result.shots, arg || undefined, result.runtime, result.a11y),
              `👁 review rendered UI${arg ? ` · ${arg}` : ''}`,
            )
          }
        })()
        break
      case 'undo':
        if (this.checkpoints.length === 0) {
          this.push('status', 'nothing to undo — no ask this session, or not a git repo with commits')
        } else {
          this.restoreTo(this.checkpoints.length - 1)
        }
        break
      case 'checkpoints':
        if (this.checkpoints.length === 0) {
          this.push('status', 'no checkpoints yet — one is taken before every ask in a git repo')
        } else {
          const lines = this.checkpoints.map((c, i) => {
            const mins = Math.max(0, Math.round((Date.now() - c.at) / 60000))
            return `${i + 1}. ${c.label} · ${mins}m ago`
          })
          this.push('status', `${lines.join('\n')}\n/restore <n> rewinds files to before that ask · /undo pops the last`)
        }
        break
      case 'restore': {
        const index = Number.parseInt(arg, 10)
        if (!Number.isInteger(index) || index < 1 || index > this.checkpoints.length) {
          this.push('status', `usage: /restore <1–${Math.max(this.checkpoints.length, 1)}> — see /checkpoints`)
        } else {
          this.restoreTo(index - 1)
        }
        break
      }
      case 'resume': {
        const saved = loadState(this.opts.cwd)
        if (!saved) {
          this.push('status', 'no previous session for this project')
          break
        }
        try {
          if (!getEngine(saved.engine).supportsResume) {
            this.push('status', `previous engine ${saved.engine} cannot resume sessions`)
            break
          }
        } catch {
          this.push('error', `previous engine ${saved.engine} is no longer available`)
          break
        }
        this.sessionId = saved.sessionId
        this.notify({ engineId: saved.engine, model: saved.model ?? this.state.model })
        this.push('status', `resumed ${saved.engine} session${saved.lastAsk ? ` · "${saved.lastAsk}"` : ''}`)
        break
      }
      case 'clear':
        this.sessionId = undefined
        clearState(this.opts.cwd)
        this.notify({ items: [], totals: { costUsd: 0, turns: 0 } })
        break
      case 'help':
        this.push(
          'status',
          '/engine <id> · /model <name> · /dev (start/stop server) · /check (quality gates) · /fix (send failures) · /shot (screenshots) · /review [focus] (visual self-critique) · /undo (revert last ask) · /checkpoints · /restore <n> · /resume (last session) · /clear (new session) · /quit',
        )
        break
      case 'quit':
      case 'exit':
        this.push('status', this.summary())
        this.dispose()
        this.opts.onQuit?.()
        break
      default:
        this.push('error', `unknown command /${name} — try /help`)
    }
  }
}
