import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Session, type SessionOptions } from '../session/engine.js'

/**
 * The detachable session: `squint serve` owns the Session over a unix
 * socket so terminals can come and go — the TUI crashing or the ssh
 * connection dropping no longer kills the run. First client is the
 * driver; later attaches observe (they see everything, they steer
 * nothing) until the driver leaves and the oldest observer inherits.
 * Remote use is ssh -L away, no cloud in the loop.
 */
export interface DaemonMessage {
  type: 'hello' | 'state' | 'denied' | 'input' | 'command' | 'interrupt' | 'cycleMode' | 'ping'
  [key: string]: unknown
}

const MAX_ITEMS_SENT = 200

export function socketPath(cwd: string): string {
  const direct = path.join(cwd, '.squint', 'daemon.sock')
  // sun_path caps unix-socket paths (~104 bytes on macOS): deep repos
  // fall back to a short tmpdir socket derived from the cwd.
  if (Buffer.byteLength(direct) <= 96) return direct
  const hash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 12)
  return path.join(os.tmpdir(), `squint-${hash}.sock`)
}

export interface Daemon {
  close(): void
  clientCount(): number
  session: Session
  /** The approval-relay address, when a webhook is configured. */
  relayUrl?: string
}

export interface DaemonOptions extends SessionOptions {
  /** How often the daemon looks for due interval checks (test hook). */
  intervalSweepMs?: number
  /** POSTed when an engine requests visual approval; one-shot approve/reject URLs ride along. */
  approvalWebhook?: string
  /** Port for the approval-relay listener (default: ephemeral). */
  relayPort?: number
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const session = new Session(opts)
  const sock = socketPath(opts.cwd)
  fs.mkdirSync(path.dirname(sock), { recursive: true })
  fs.rmSync(sock, { force: true })

  const clients: net.Socket[] = []
  const driver = (): net.Socket | undefined => clients[0]

  const serialize = (): string => {
    const state = session.getState()
    return `${JSON.stringify({ type: 'state', state: { ...state, items: state.items.slice(-MAX_ITEMS_SENT) } })}\n`
  }

  const server = net.createServer((socket) => {
    clients.push(socket)
    const role = socket === driver() ? 'driver' : 'observer'
    socket.write(`${JSON.stringify({ type: 'hello', role, engineId: session.getState().engineId })}\n`)
    socket.write(serialize())

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (!line.trim()) continue
        let msg: DaemonMessage
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.type === 'ping') {
          socket.write(`${JSON.stringify({ type: 'ping' })}\n`)
          continue
        }
        if (socket !== driver()) {
          socket.write(`${JSON.stringify({ type: 'denied', reason: 'observer — the driver steers this session' })}\n`)
          continue
        }
        if (msg.type === 'input' && typeof msg.text === 'string') session.input(msg.text)
        else if (msg.type === 'command' && typeof msg.text === 'string') session.command(msg.text)
        else if (msg.type === 'interrupt') session.interrupt()
        else if (msg.type === 'cycleMode') session.cycleMode()
      }
    })

    const drop = () => {
      const index = clients.indexOf(socket)
      if (index >= 0) clients.splice(index, 1)
      // Promotion: tell the new driver, if any.
      const next = driver()
      if (index === 0 && next && !next.destroyed) {
        next.write(`${JSON.stringify({ type: 'hello', role: 'driver', engineId: session.getState().engineId })}\n`)
      }
    }
    socket.on('close', drop)
    socket.on('error', drop)
  })

  // Interval checks: the daemon owns wall-clock time, so checks with
  // `// squint-trigger: interval[:s]` run between turns against the dev
  // server — a crashed page gets noticed while everyone is asleep.
  const lastRun = new Map<string, number>()
  const sweep = setInterval(async () => {
    const state = session.getState()
    if (!state.devUrl || state.running) return
    try {
      const { runIntervalSweep } = await import('../preview/checks.js')
      const failures = await runIntervalSweep(opts.cwd, state.devUrl, lastRun)
      if (failures.length > 0) {
        session.note(`⏰ interval check(s) failing:\n${failures.join('\n')}`)
      }
    } catch {
      // the clock never crashes the session
    }
  }, opts.intervalSweepMs ?? 60000)
  sweep.unref?.()

  // Approval relay: an engine's request_visual_approval becomes a POST
  // to the configured webhook carrying signed one-shot approve/reject
  // URLs (loopback listener; expose via your tunnel of choice). The
  // last mile claude-code#26000 asks for — squint ships it first.
  let relayServer: import('node:http').Server | null = null
  let relayUrl: string | undefined
  let relayUnsub: (() => void) | null = null
  if (opts.approvalWebhook) {
    const http = await import('node:http')
    const crypto2 = await import('node:crypto')
    const tokens = new Map<string, 'yes' | 'no'>()
    relayServer = http.createServer((req, res) => {
      const token = (req.url ?? '').replace(/^\//, '')
      const verdict = tokens.get(token)
      if (!verdict) {
        res.writeHead(404).end('unknown or already-used token')
        return
      }
      tokens.clear()
      session.command(verdict === 'yes' ? '/yes approved via webhook' : '/no rejected via webhook')
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(verdict === 'yes' ? 'approved — the engine proceeds' : 'rejected — the engine stands down')
    })
    await new Promise<void>((resolve) => relayServer?.listen(opts.relayPort ?? 0, '127.0.0.1', resolve))
    const addr = relayServer.address() as { port: number }
    relayUrl = `http://127.0.0.1:${addr.port}`
    let lastSeen: string | null = null
    relayUnsub = session.subscribe(() => {
      const pending = session.getState().pendingApproval
      if (!pending || pending === lastSeen) {
        if (!pending) lastSeen = null
        return
      }
      lastSeen = pending
      const approve = crypto2.randomBytes(16).toString('hex')
      const reject = crypto2.randomBytes(16).toString('hex')
      tokens.clear()
      tokens.set(approve, 'yes')
      tokens.set(reject, 'no')
      fetch(opts.approvalWebhook!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `squint approval requested: ${pending}`,
          summary: pending,
          approveUrl: `${relayUrl}/${approve}`,
          rejectUrl: `${relayUrl}/${reject}`,
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)
    })
  }

  const unsubscribe = session.subscribe(() => {
    const payload = serialize()
    for (const client of clients) {
      if (!client.destroyed) client.write(payload)
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(sock, () => {
      resolve({
        session,
        relayUrl,
        clientCount: () => clients.length,
        close: () => {
          clearInterval(sweep)
          relayUnsub?.()
          relayServer?.close()
          unsubscribe()
          for (const client of clients) client.destroy()
          server.close()
          fs.rmSync(sock, { force: true })
        },
      })
    })
  })
}
