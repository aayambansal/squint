import net from 'node:net'
import type { DaemonMessage } from './server.js'

/** Thin JSON-lines client for the daemon socket; used by attach and tests. */
export interface DaemonClient {
  send(msg: DaemonMessage): void
  onMessage(handler: (msg: DaemonMessage) => void): void
  close(): void
}

export function connectDaemon(sock: string, timeoutMs = 3000): Promise<DaemonClient> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(sock)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`no daemon listening at ${sock}`))
    }, timeoutMs)
    const handlers: ((msg: DaemonMessage) => void)[] = []
    let buffer = ''

    socket.on('connect', () => {
      clearTimeout(timer)
      resolve({
        send: (msg) => socket.write(`${JSON.stringify(msg)}\n`),
        onMessage: (handler) => handlers.push(handler),
        close: () => socket.destroy(),
      })
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          for (const handler of handlers) handler(msg)
        } catch {
          // partial or foreign lines are skipped
        }
      }
    })
  })
}
