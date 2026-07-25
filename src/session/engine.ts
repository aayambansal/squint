import path from 'node:path'
import { buildFixPrompt, DevServer, type DevServerState, detectDevCommand } from '../devserver/devserver.js'
import { getEngine } from '../engines/registry.js'
import type { AgentEvent, RunMode } from '../engines/types.js'
import { buildGatePrompt, detectFastGates, detectGates, runGates } from '../gates/gates.js'
import {
  buildReviewPrompt,
  buildRuntimeFixPrompt,
  type CaptureResult,
  captureViewports,
  comparePulse,
  probeRuntime,
  runtimeSummary,
} from '../preview/preview.js'
import { composePrompt } from '../prompt/brief.js'
import { enrich } from '../prompt/skills.js'
import { runAgent } from '../runner/run.js'
import { clearState, loadState, saveState } from '../state/state.js'
import {
  applySandbox,
  discardSandbox,
  openSandbox,
  sandboxDiffStat,
  sandboxDir,
  sandboxExists,
  sandboxFiles,
} from '../vcs/sandbox.js'
import { diffStatSince, isGitRepo, restoreSnapshot, type Snapshot, takeSnapshot } from '../vcs/snapshot.js'
import { applyVariant, cleanVariants, listVariants, runVariants } from '../variants/variants.js'
import { screenshotVariants } from '../variants/shots.js'
import { findChrome } from '../preview/chrome.js'

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

export type ProblemSource = 'gates' | 'dev' | 'runtime' | 'a11y'

export interface Problem {
  id: number
  source: ProblemSource
  summary: string
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
  /** How much the engine may do this session. */
  mode: RunMode
  /** Open findings from gates, the dev server, the runtime, and a11y sweeps. */
  problems: Problem[]
  /** Asks accumulate in a shadow worktree until /sandbox apply. */
  sandbox: boolean
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
  /** Session budget in USD; crossing it warns (never blocks). */
  budgetUsd?: number
  /** Auto-run /review when the visual pulse shows a big change. */
  autoReview?: boolean
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
  /** Full problem records; state carries the summaries. */
  private problemPrompts = new Map<number, string>()
  private nextProblemId = 0
  private checkpoints: Array<{ snapshot: Snapshot; label: string; at: number }> = []
  private fixAttempts = 0
  private reviewTipShown = false
  private lastPulse: Buffer | null = null
  private autoReviewedThisAsk = false
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
      mode: 'safe',
      problems: [],
      sandbox: false,
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

  /** Register a finding; a fresh finding from a source supersedes its old one. */
  private addProblem(source: ProblemSource, summary: string, prompt: string): void {
    const kept = this.state.problems.filter((p) => p.source !== source)
    for (const gone of this.state.problems) {
      if (gone.source === source) this.problemPrompts.delete(gone.id)
    }
    this.nextProblemId += 1
    this.problemPrompts.set(this.nextProblemId, prompt)
    this.notify({ problems: [...kept, { id: this.nextProblemId, source, summary }] })
  }

  private clearProblems(source: ProblemSource): void {
    const removed = this.state.problems.filter((p) => p.source === source)
    if (removed.length === 0) return
    for (const problem of removed) this.problemPrompts.delete(problem.id)
    this.notify({ problems: this.state.problems.filter((p) => p.source !== source) })
  }

  /** One prompt covering the given problems, oldest first. */
  private combinedFixPrompt(problems: Problem[]): string {
    const sections = problems.map(
      (p) => this.problemPrompts.get(p.id) ?? `Fix this reported problem: ${p.summary}`,
    )
    return sections.join('\n\n---\n\n')
  }

  private dispatchFix(problems: Problem[]): void {
    if (problems.length === 0) return
    const prompt = this.combinedFixPrompt(problems)
    const display = `⛑ fix: ${problems.map((p) => p.source).join(' + ')}`
    for (const problem of problems) this.problemPrompts.delete(problem.id)
    this.notify({ problems: this.state.problems.filter((p) => !problems.includes(p)) })
    void this.runTurn(prompt, display)
  }

  /** Launch a capped auto-fix turn over all open problems. Returns true if launched. */
  private maybeAutoFix(): boolean {
    if (!this.opts.autoFix || this.fixAttempts >= MAX_AUTO_FIX_ATTEMPTS) return false
    if (this.state.problems.length === 0) return false
    this.fixAttempts += 1
    this.push('status', `auto-fix attempt ${this.fixAttempts}/${MAX_AUTO_FIX_ATTEMPTS}`)
    this.notify({ running: false })
    this.dispatchFix([...this.state.problems])
    return true
  }

  setMode(mode: RunMode): void {
    this.notify({ mode })
    const hint =
      mode === 'plan'
        ? 'read-only: the engine investigates and proposes, edits nothing'
        : mode === 'yolo'
          ? 'no approval friction — the engine can do anything'
          : 'edits auto-approved inside the workspace'
    this.push('status', `mode → ${mode} · ${hint}`)
  }

  cycleMode(): void {
    const order: RunMode[] = ['safe', 'plan', 'yolo']
    const next = order[(order.indexOf(this.state.mode) + 1) % order.length]!
    this.setMode(next)
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

  /** Where engines run and servers start: the sandbox worktree when on. */
  private execCwd(): string {
    return this.state.sandbox ? sandboxDir(this.opts.cwd) : this.opts.cwd
  }

  private devServer(): DevServer {
    if (!this.dev) {
      this.dev = new DevServer(this.execCwd(), {
        onStateChange: (devState) => this.notify({ devState }),
        onUrl: (url) => this.notify({ devUrl: url }),
      })
    }
    return this.dev
  }

  /** Rebind the dev server after the execution tree changes. */
  private resetDevServer(): void {
    const wasRunning = this.dev && this.dev.state !== 'stopped'
    this.dev?.stop()
    this.dev = null
    this.notify({ devUrl: null, devState: 'stopped' })
    if (wasRunning) {
      const command = detectDevCommand(this.execCwd())
      if (command) {
        this.devServer().start(command)
        this.push('status', `dev server restarting in ${this.state.sandbox ? 'the sandbox' : 'the real tree'}`)
      }
    }
  }

  private turnEdits = 0
  private turnTools = 0
  private toolStreak = 0
  private collapsedTools = 0

  /**
   * Long tool cascades collapse: the first three of a consecutive burst
   * render, the rest fold into one "+N more" line pushed when the burst
   * ends — append-only, so the Static transcript stays valid.
   */
  private flushToolCollapse(): void {
    if (this.collapsedTools > 0) {
      this.push('tool', `+${this.collapsedTools} more tool call${this.collapsedTools === 1 ? '' : 's'}`)
      this.collapsedTools = 0
    }
    this.toolStreak = 0
  }

  private handleEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case 'status':
        this.commitLive()
        this.flushToolCollapse()
        this.push('status', event.text)
        break
      case 'delta':
        this.setLive(this.live + event.text)
        break
      case 'text':
        this.flushToolCollapse()
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
        this.flushToolCollapse()
        this.push('thinking', event.text)
        break
      case 'tool': {
        this.commitLive()
        this.turnTools += 1
        this.toolStreak += 1
        if (/edit|write|patch|apply/i.test(event.name)) this.turnEdits += 1
        if (this.toolStreak <= 3) {
          this.push('tool', event.detail ? `${event.name} · ${event.detail}` : event.name)
        } else {
          this.collapsedTools += 1
        }
        break
      }
      case 'error':
        this.commitLive()
        this.flushToolCollapse()
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
    this.turnEdits = 0
    this.turnTools = 0
    this.notify({ running: true, runStartedAt: Date.now() })
    const runStart = Date.now()
    const engine = getEngine(this.state.engineId)
    this.abort = new AbortController()
    const result = await runAgent(
      engine,
      {
        prompt,
        cwd: this.execCwd(),
        model: this.state.model,
        mode: this.state.mode,
        sessionId: engine.supportsResume ? this.sessionId : undefined,
      },
      this.handleEvent,
      this.abort.signal,
    )
    this.abort = null
    this.commitLive()
    this.flushToolCollapse()
    if (result.ok) {
      const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
      const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
      // Prefer measured reality (git diff vs this ask's checkpoint) over
      // tool-call counting; fall back to counts outside git.
      const checkpoint = this.checkpoints.at(-1)
      const stat = checkpoint ? diffStatSince(this.opts.cwd, checkpoint.snapshot) : null
      const work = stat
        ? ` · ${stat}`
        : this.turnEdits > 0
          ? ` · ${this.turnEdits} edit${this.turnEdits === 1 ? '' : 's'}`
          : this.turnTools > 0
            ? ` · ${this.turnTools} tool call${this.turnTools === 1 ? '' : 's'}`
            : ''
      this.push('status', `done${secs}${cost}${work}`)
      const before = this.state.totals.costUsd
      this.notify({
        totals: {
          costUsd: before + (result.costUsd ?? 0),
          turns: this.state.totals.turns + 1,
        },
      })
      const budget = this.opts.budgetUsd
      if (budget && before < budget && this.state.totals.costUsd >= budget) {
        this.push(
          'error',
          `session cost $${this.state.totals.costUsd.toFixed(2)} crossed your $${budget.toFixed(2)} budget — squint keeps working, this is just the flag you asked for`,
        )
      }
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
      const fastGates = detectFastGates(this.execCwd())
      if (fastGates.length > 0) {
        const gateResults = await runGates(this.execCwd(), fastGates)
        const failures = gateResults.filter((r) => !r.ok)
        if (failures.length > 0) {
          this.addProblem(
            'gates',
            failures.map((f) => f.gate.id).join(' + '),
            buildGatePrompt(failures),
          )
          this.push(
            'error',
            failures.map((f) => `✗ ${f.gate.id} · ${f.outputTail.split('\n').slice(-3).join('\n')}`).join('\n'),
          )
          if (this.maybeAutoFix()) return
          this.push('status', '/fix sends open problems to the engine · /problems lists them')
          this.notify({ running: false })
          this.drainQueue()
          return
        }
        this.clearProblems('gates')
      }
    }

    // The Lovable loop: give the dev server a moment to rebuild, then
    // sweep for fresh errors and route them back to the engine.
    const dev = this.dev
    if (result.error !== 'interrupted' && dev && (dev.state === 'running' || dev.state === 'starting')) {
      await delay(1500)
      const errors = dev.errorsSince(runStart)
      if (errors.length > 0) {
        this.addProblem(
          'dev',
          `${errors.length} dev server error line(s)`,
          buildFixPrompt(errors, dev.tail(30)),
        )
        this.push('error', `dev server: ${errors.length} error line(s)\n${errors.slice(-5).join('\n')}`)
        if (this.maybeAutoFix()) return
        this.push('status', '/fix sends open problems to the engine · /problems lists them')
      } else {
        this.clearProblems('dev')
        // Build output is clean — probe the page itself for client-side
        // breakage the server never sees (blank page, exceptions, 404s).
        if (this.opts.autoProbe !== false && this.state.devUrl) {
          const probe = await probeRuntime(this.state.devUrl, this.opts.cwd)
          const summary = probe ? runtimeSummary(probe.report) : null
          if (probe && summary) {
            this.addProblem('runtime', summary, buildRuntimeFixPrompt(probe.report))
            this.push('error', `runtime: ${summary}`)
            if (this.maybeAutoFix()) return
            this.push('status', '/fix sends open problems to the engine · /problems lists them')
          } else if (probe) {
            this.clearProblems('runtime')
            const pct = await this.visualPulse(probe.pulsePath)
            // Substantial visual change + autoReview → the engine looks at
            // its own work, once per ask.
            if (this.opts.autoReview && pct !== null && pct >= 10 && !this.autoReviewedThisAsk) {
              this.autoReviewedThisAsk = true
              this.push('status', `auto-review: the page changed ${pct.toFixed(0)}% — capturing for self-critique`)
              this.notify({ running: false })
              const captureResult = await this.capture()
              if (captureResult) {
                await this.runTurn(
                  buildReviewPrompt(captureResult.shots, undefined, captureResult.runtime, captureResult.a11y),
                  '👁 auto-review rendered UI',
                )
              }
              return
            }
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
    this.autoReviewedThisAsk = false
    // Checkpoint per ask: the snapshot covers this turn plus its fixes.
    // In sandbox mode the worktree IS the safety net; discard is the undo.
    const snapshot = this.state.sandbox ? null : takeSnapshot(this.opts.cwd)
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
    let prompt = isFirstTurn ? composePrompt(ask, { cwd: this.opts.cwd, firstTurn: true }) : ask
    // Repo rules + keyword-triggered skills ride along on every ask.
    const enrichment = enrich(this.opts.cwd, ask)
    if (enrichment.matchedSkills.length > 0) {
      this.push('status', `skills: ${enrichment.matchedSkills.join(', ')}`)
    }
    prompt += enrichment.sections
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

  /**
   * Cross-turn visual drift check: compare this turn's pulse screenshot
   * with the previous one and report how much of the page changed.
   * Informational — changes are usually intended; surprises shouldn't be.
   */
  private async visualPulse(pulsePath: string | undefined): Promise<number | null> {
    if (!pulsePath) return null
    let current: Buffer
    try {
      current = (await import('node:fs')).readFileSync(pulsePath)
    } catch {
      return null
    }
    const previous = this.lastPulse
    this.lastPulse = current
    if (!previous) {
      this.push('status', 'visual pulse: baseline captured')
      return null
    }
    const pct = await comparePulse(previous, current)
    if (pct === null) return null
    this.push(
      'status',
      pct < 0.5 ? 'visual pulse: stable vs last turn' : `visual pulse: ${pct.toFixed(1)}% of the page changed vs last turn`,
    )
    return pct
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
        this.addProblem('runtime', summary, buildRuntimeFixPrompt(result.runtime))
        this.push('status', '/fix sends open problems to the engine')
      } else {
        this.clearProblems('runtime')
        this.push('status', 'runtime clean — no console errors, exceptions, or failed requests')
      }
    }
    if (result.a11y && result.a11y.length > 0) {
      this.push('error', `a11y: ${result.a11y.length} finding(s)\n${result.a11y.slice(0, 5).join('\n')}`)
      this.addProblem(
        'a11y',
        `${result.a11y.length} accessibility finding(s)`,
        `Fix these accessibility defects found by an automated sweep of the running app:\n\n${result.a11y.join('\n')}\n\nThey are objective defects, not style preferences.`,
      )
      this.push('status', '/review folds these into the fix pass · /fix sends them directly')
    } else if (result.runtime) {
      this.clearProblems('a11y')
    }
    return result.shots.length > 0 ? result : null
  }

  command(commandLine: string): void {
    const [name, ...rest] = commandLine.slice(1).split(/\s+/)
    const arg = rest.join(' ').trim()
    switch (name) {
      case 'engines': {
        void import('../engines/registry.js').then(({ detectEngines }) => {
          const lines = detectEngines().map(({ engine, path: binaryPath }) => {
            const mark = binaryPath ? '✓' : '✗'
            const traits = [engine.createParser ? 'stream' : 'text', engine.supportsResume ? 'resume' : null]
              .filter(Boolean)
              .join(' · ')
            return `${mark} ${engine.id} — ${traits}${binaryPath ? '' : ` · install: ${engine.install}`}`
          })
          this.push('status', `${lines.join('\n')}\n/engine <id> switches (new session)`)
        })
        break
      }
      case 'engine':
        if (!arg) {
          this.command('/engines')
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
      case 'mode':
        if (arg === 'plan' || arg === 'safe' || arg === 'yolo') {
          this.setMode(arg)
        } else {
          this.push('status', 'usage: /mode plan|safe|yolo — or shift+tab to cycle')
        }
        break
      case 'dev': {
        const dev = this.devServer()
        if (arg === 'logs') {
          const tail = dev.tail(15)
          this.push('status', tail.length > 0 ? tail.join('\n') : 'no dev server output captured yet')
          break
        }
        if (arg === 'restart') {
          if (dev.state !== 'stopped') dev.stop()
          this.notify({ devUrl: null })
          const devCommand = detectDevCommand(this.opts.cwd)
          if (!devCommand) {
            this.push('error', 'no dev/start script found in package.json')
          } else {
            dev.start(devCommand)
            this.push('status', `dev server restarting · ${devCommand.display}`)
          }
          break
        }
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
      case 'fix': {
        if (this.state.problems.length === 0) {
          this.push('status', 'nothing to fix — no open problems')
          break
        }
        const index = Number.parseInt(arg, 10)
        if (arg && Number.isInteger(index)) {
          const target = this.state.problems[index - 1]
          if (!target) {
            this.push('status', `usage: /fix [1–${this.state.problems.length}] — see /problems`)
            break
          }
          this.dispatchFix([target])
        } else {
          this.dispatchFix([...this.state.problems])
        }
        break
      }
      case 'save': {
        void (async () => {
          const fs = await import('node:fs')
          const path = await import('node:path')
          const dir = path.join(this.opts.cwd, '.squint', 'transcripts')
          fs.mkdirSync(dir, { recursive: true })
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const file = path.join(dir, `${stamp}.md`)
          const lines: string[] = [`# squint session — ${new Date().toISOString().slice(0, 16)}`, '']
          for (const item of this.state.items) {
            switch (item.role) {
              case 'user':
                lines.push(`## ❯ ${item.text}`, '')
                break
              case 'assistant':
                lines.push(item.text, '')
                break
              case 'tool':
                lines.push(`- ⚙ ${item.text}`)
                break
              case 'thinking':
                break
              default:
                lines.push(`> ${item.role === 'error' ? '✗ ' : ''}${item.text.split('\n').join('\n> ')}`)
            }
          }
          lines.push('', `> ${this.summary()}`)
          fs.writeFileSync(file, lines.join('\n') + '\n')
          this.push('status', `saved transcript → ${path.relative(this.opts.cwd, file)}`)
        })()
        break
      }
      case 'copy': {
        const last = this.state.items.findLast((i) => i.role === 'assistant')
        if (!last) {
          this.push('status', 'nothing to copy yet')
          break
        }
        void import('node:child_process').then(({ spawn }) => {
          const cmd =
            process.platform === 'darwin'
              ? spawn('pbcopy')
              : process.platform === 'win32'
                ? spawn('clip')
                : spawn('xclip', ['-selection', 'clipboard'])
          cmd.on('error', () => this.push('error', 'no clipboard tool found'))
          cmd.on('close', (code) => {
            if (code === 0) this.push('status', `copied last reply (${last.text.length} chars)`)
          })
          cmd.stdin?.end(last.text)
        })
        break
      }
      case 'problems':
        if (this.state.problems.length === 0) {
          this.push('status', 'no open problems')
        } else {
          const lines = this.state.problems.map((p, i) => `${i + 1}. [${p.source}] ${p.summary}`)
          this.push('status', `${lines.join('\n')}\n/fix sends all · /fix <n> targets one`)
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
            this.addProblem('gates', failures.map((f) => f.gate.id).join(' + '), buildGatePrompt(failures))
            this.push('status', '/fix sends open problems to the engine · /problems lists them')
          } else {
            this.clearProblems('gates')
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
      case 'sandbox': {
        if (this.state.running) {
          this.push('status', 'wait for the current turn before changing sandbox state')
          break
        }
        if (arg === 'diff') {
          const stat = sandboxDiffStat(this.opts.cwd)
          if (!stat) {
            this.push('status', sandboxExists(this.opts.cwd) ? 'sandbox is clean' : 'no sandbox open — /sandbox on')
          } else {
            this.push('status', `${stat}\n${sandboxFiles(this.opts.cwd).join('\n')}`)
          }
          break
        }
        if (arg === 'apply') {
          const applied = applySandbox(this.opts.cwd)
          if (applied.ok) {
            discardSandbox(this.opts.cwd)
            this.notify({ sandbox: false })
            this.resetDevServer()
            this.push('status', 'sandbox applied to the real tree — review with git diff')
          } else {
            this.push('error', applied.detail ?? 'apply failed')
          }
          break
        }
        if (arg === 'discard' || arg === 'off') {
          const had = discardSandbox(this.opts.cwd)
          this.notify({ sandbox: false })
          this.resetDevServer()
          this.push('status', had ? 'sandbox discarded — the real tree was never touched' : 'no sandbox open')
          break
        }
        if (arg === 'on' || arg === '') {
          if (!isGitRepo(this.opts.cwd)) {
            this.push('error', 'sandbox needs a git repo with at least one commit')
            break
          }
          const { reused } = openSandbox(this.opts.cwd)
          this.notify({ sandbox: true })
          this.resetDevServer()
          this.push(
            'status',
            `${reused ? 'rejoined the open sandbox' : 'sandbox opened'} — asks now accumulate in a shadow worktree; /sandbox diff · apply · discard`,
          )
          break
        }
        this.push('status', 'usage: /sandbox [on] · diff · apply · discard')
        break
      }
      case 'variants': {
        const [sub, ...subRest] = arg.split(/\s+/)
        if (sub === 'apply') {
          const id = subRest[0]
          if (!id) {
            this.push('status', 'usage: /variants apply <id>')
            break
          }
          const applied = applyVariant(this.opts.cwd, id)
          if (applied.ok) {
            cleanVariants(this.opts.cwd)
            this.push('status', `applied ${id} to the working tree — review with git diff`)
          } else {
            this.push('error', applied.detail ?? 'apply failed')
          }
          break
        }
        if (sub === 'clean') {
          this.push('status', `removed ${cleanVariants(this.opts.cwd)} variant(s)`)
          break
        }
        if (sub === 'list') {
          const ids = listVariants(this.opts.cwd)
          this.push('status', ids.length > 0 ? ids.join(' · ') : 'no variants — /variants <2-4> <ask>')
          break
        }
        const n = Number.parseInt(sub ?? '', 10)
        const ask = subRest.join(' ').trim()
        if (!Number.isInteger(n) || n < 2 || n > 4 || ask.length === 0) {
          this.push('status', 'usage: /variants <2-4> <ask> · /variants apply <id> · list · clean')
          break
        }
        if (!isGitRepo(this.opts.cwd)) {
          this.push('error', 'variants need a git repo with at least one commit')
          break
        }
        void (async () => {
          cleanVariants(this.opts.cwd)
          this.push('status', `generating ${n} directions in parallel — this runs ${n} engine sessions`)
          this.notify({ running: true, runStartedAt: Date.now() })
          const engine = getEngine(this.state.engineId)
          const runs = await runVariants(this.opts.cwd, ask, n, engine, this.state.model, (familyId, text) =>
            this.push('status', `[${familyId}] ${text}`),
          )
          const succeeded = runs.filter((r) => r.result.ok)
          if (succeeded.length > 0 && findChrome() && detectDevCommand(this.opts.cwd)) {
            this.push('status', 'capturing one screenshot per variant…')
            const shots = await screenshotVariants(this.opts.cwd, succeeded.map((r) => r.variant))
            for (const shot of shots) {
              this.push(
                shot.path ? 'status' : 'error',
                `[${shot.familyId}] ${shot.path ?? shot.error ?? 'screenshot failed'}`,
              )
            }
          }
          this.notify({ running: false })
          this.push(
            succeeded.length > 0 ? 'status' : 'error',
            `${succeeded.length}/${runs.length} variants ready — /variants apply <id> keeps one, /variants clean discards`,
          )
          this.drainQueue()
        })()
        break
      }
      case 'clear':
        this.sessionId = undefined
        clearState(this.opts.cwd)
        this.notify({ items: [], totals: { costUsd: 0, turns: 0 } })
        break
      case 'help': {
        void import('./commands.js').then(({ commandHelp }) => this.push('status', commandHelp()))
        break
      }
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
