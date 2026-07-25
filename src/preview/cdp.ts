import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Minimal Chrome DevTools Protocol client over Node's built-in WebSocket.
 * One headless Chrome session gives squint runtime eyes: console errors,
 * uncaught exceptions, failed requests — and screenshots at emulated
 * viewports, all in a single page load.
 */
export interface RuntimeReport {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
}

export interface CdpShot {
  name: string
  width: number
  height: number
}

export interface CdpCaptureResult {
  report: RuntimeReport
  shots: { name: string; path: string }[]
  /** Findings from the in-page accessibility sweep (when requested). */
  a11y: string[]
}

/**
 * Dependency-free in-page accessibility sweep: the objective checks
 * that don't need a full axe run — alt text, accessible names, label
 * association, document lang/title, heading order, tap-target size,
 * positive tabindex. Returns human-readable findings, capped at 20.
 */
const A11Y_AUDIT = `(() => {
  const out = [];
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
  const short = (el) => '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/).slice(0, 2).join('.') : '') + '>';
  if (!document.documentElement.getAttribute('lang')) out.push('document missing lang attribute');
  if (!document.title.trim()) out.push('document missing <title>');
  for (const img of document.querySelectorAll('img:not([alt])')) out.push('img missing alt: ' + (img.getAttribute('src') || '').split('/').pop());
  for (const el of document.querySelectorAll('button, a[href]')) {
    if (!name(el) && !el.querySelector('img[alt]')) out.push(el.tagName.toLowerCase() + ' without accessible name ' + short(el));
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
    if (!labelled) out.push('form control without label ' + short(el));
  }
  let last = 0;
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const level = Number(h.tagName[1]);
    if (last && level > last + 1) out.push('heading order jumps h' + last + ' → h' + level + ' ' + short(h));
    last = level;
  }
  let tiny = 0;
  for (const el of document.querySelectorAll('button, a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.width < 24 || r.height < 24)) tiny++;
  }
  if (tiny > 0) out.push(tiny + ' interactive element(s) smaller than 24x24px');
  for (const el of document.querySelectorAll('[tabindex]')) {
    if (Number(el.getAttribute('tabindex')) > 0) out.push('positive tabindex ' + short(el));
  }
  return out.slice(0, 20);
})()`

export function hasWebSocket(): boolean {
  return typeof globalThis.WebSocket === 'function'
}

interface Pending {
  resolve(value: any): void
  reject(reason: Error): void
}

class CdpConnection {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, Pending>()
  private listeners = new Map<string, (params: any, sessionId?: string) => void>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (event) => {
      let data: any
      try {
        data = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (typeof data.id === 'number') {
        const entry = this.pending.get(data.id)
        if (entry) {
          this.pending.delete(data.id)
          if (data.error) entry.reject(new Error(data.error.message ?? 'CDP error'))
          else entry.resolve(data.result)
        }
      } else if (typeof data.method === 'string') {
        this.listeners.get(data.method)?.(data.params, data.sessionId)
      }
    })
  }

  static connect(url: string, timeoutMs: number): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error('CDP connect timeout'))
      }, timeoutMs)
      ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolve(new CdpConnection(ws))
      })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('CDP connect failed'))
      })
    })
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 15000)
    })
  }

  on(method: string, handler: (params: any, sessionId?: string) => void): void {
    this.listeners.set(method, handler)
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      // already closed
    }
  }
}

function launchChrome(chromePath: string): Promise<{ child: ChildProcess; wsUrl: string; profileDir: string }> {
  return new Promise((resolve, reject) => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-chrome-'))
    const child = spawn(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        ...(process.env.CI ? ['--no-sandbox'] : []),
        '--no-first-run',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Chrome did not announce DevTools endpoint'))
    }, 15000)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)
      if (match && match[1]) {
        clearTimeout(timer)
        resolve({ child, wsUrl: match[1], profileDir })
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', () => clearTimeout(timer))
  })
}

const describe = (value: any): string => {
  if (value == null) return ''
  if (typeof value === 'object') {
    return String(value.description ?? value.value ?? JSON.stringify(value))
  }
  return String(value)
}

/**
 * Load `url` once, watching the runtime; screenshot at each viewport by
 * emulating device metrics. Chrome is fully cleaned up afterward.
 */
export async function cdpCapture(
  chromePath: string,
  url: string,
  outDir: string,
  viewports: readonly CdpShot[],
  settleMs = 2500,
  audit = false,
): Promise<CdpCaptureResult> {
  const { child, wsUrl, profileDir } = await launchChrome(chromePath)
  const report: RuntimeReport = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  const shots: { name: string; path: string }[] = []
  let a11y: string[] = []
  const requests = new Map<string, string>()
  let connection: CdpConnection | null = null

  try {
    connection = await CdpConnection.connect(wsUrl, 10000)
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true })

    connection.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error' || params.type === 'assert') {
        const text = (params.args ?? []).map(describe).join(' ')
        if (text) report.consoleErrors.push(text)
      }
    })
    connection.on('Runtime.exceptionThrown', (params) => {
      const detail = params.exceptionDetails
      const text = detail?.exception?.description ?? detail?.text
      if (text) report.pageErrors.push(String(text).split('\n').slice(0, 3).join('\n'))
    })
    connection.on('Network.requestWillBeSent', (params) => {
      requests.set(params.requestId, params.request?.url ?? 'unknown')
    })
    connection.on('Network.responseReceived', (params) => {
      const status = params.response?.status ?? 0
      if (status >= 400) {
        report.failedRequests.push(`${status} ${params.response?.url ?? requests.get(params.requestId) ?? ''}`)
      }
    })
    connection.on('Network.loadingFailed', (params) => {
      if (params.canceled) return
      const target = requests.get(params.requestId)
      if (target) report.failedRequests.push(`${params.errorText ?? 'failed'} ${target}`)
    })

    let loaded = false
    connection.on('Page.loadEventFired', () => {
      loaded = true
    })

    await connection.send('Runtime.enable', {}, sessionId)
    await connection.send('Network.enable', {}, sessionId)
    await connection.send('Page.enable', {}, sessionId)
    await connection.send('Page.navigate', { url }, sessionId)

    const deadline = Date.now() + 12000
    while (!loaded && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await new Promise((resolve) => setTimeout(resolve, settleMs))

    if (audit) {
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: A11Y_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) a11y = result.value.map(String)
      } catch {
        // The sweep is best-effort; a failed audit never blocks capture.
      }
    }

    for (const viewport of viewports) {
      await connection.send(
        'Emulation.setDeviceMetricsOverride',
        {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.width < 500,
        },
        sessionId,
      )
      await new Promise((resolve) => setTimeout(resolve, 250))
      const { data } = await connection.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const outPath = path.join(outDir, `${viewport.name}.png`)
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'))
      shots.push({ name: viewport.name, path: outPath })
    }
  } finally {
    connection?.close()
    child.kill('SIGKILL')
    setTimeout(() => fs.rmSync(profileDir, { recursive: true, force: true }), 500).unref?.()
  }

  return { report, shots, a11y }
}
