import { connectDaemon, type DaemonClient } from './client.js'
import { socketPath } from './server.js'
import type { SessionState } from '../session/engine.js'

/**
 * A Session look-alike backed by the daemon socket, so the full TUI
 * attaches to a served session with no code knowing the difference.
 * State arrives as broadcasts; steering goes back over the wire; local
 * notes overlay the last snapshot until the next broadcast replaces it.
 */
export interface SessionHandle {
  subscribe(listener: () => void): () => void
  getState(): SessionState
  input(raw: string): void
  interrupt(): void
  cycleMode(): void
  note(text: string): void
  summary(): string
  dispose(): void
}

let noteId = 0

export class RemoteSession implements SessionHandle {
  private state: SessionState
  private listeners = new Set<() => void>()
  private attachedAt = Date.now()
  role: 'driver' | 'observer' = 'driver'

  private constructor(
    private client: DaemonClient,
    engineId: string,
  ) {
    this.state = {
      items: [],
      liveText: '',
      running: false,
      runStartedAt: 0,
      engineId,
      devState: 'stopped',
      devUrl: null,
      totals: { turns: 0, costUsd: 0 },
      queue: [],
      mode: 'safe',
      problems: [],
      sandbox: false,
    }
    client.onMessage((msg) => {
      if (msg.type === 'state' && msg.state) {
        this.state = msg.state as SessionState
        this.emit()
      } else if (msg.type === 'hello') {
        this.role = msg.role === 'observer' ? 'observer' : 'driver'
        if (msg.role === 'driver' && Date.now() - this.attachedAt > 1000) {
          this.overlay('the driver detached — this terminal now steers')
        }
      } else if (msg.type === 'denied') {
        this.overlay(String(msg.reason ?? 'observer — read-only'))
      }
    })
  }

  static async connect(cwd: string): Promise<RemoteSession> {
    const client = await connectDaemon(socketPath(cwd))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('daemon never said hello')), 3000)
      const session = new RemoteSession(client, 'unknown')
      client.onMessage((msg) => {
        if (msg.type === 'hello') {
          clearTimeout(timer)
          session.state = { ...session.state, engineId: String(msg.engineId ?? 'unknown') }
          resolve(session)
        }
      })
    })
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  /** Local-only status line layered onto the current snapshot. */
  private overlay(text: string): void {
    this.state = {
      ...this.state,
      items: [...this.state.items, { id: 1_000_000 + ++noteId, role: 'status' as const, text }],
    }
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): SessionState {
    return this.state
  }

  input(raw: string): void {
    this.client.send({ type: 'input', text: raw })
  }

  interrupt(): void {
    this.client.send({ type: 'interrupt' })
  }

  cycleMode(): void {
    this.client.send({ type: 'cycleMode' })
  }

  note(text: string): void {
    this.overlay(text)
  }

  summary(): string {
    const mins = Math.max(1, Math.round((Date.now() - this.attachedAt) / 60000))
    return `detached after ${mins}m — the session keeps running (squint attach rejoins)`
  }

  dispose(): void {
    this.client.close()
  }
}
