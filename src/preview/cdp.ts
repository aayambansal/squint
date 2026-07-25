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

export interface PerfMetrics {
  /** Largest contentful paint, ms. */
  lcpMs?: number
  /** Cumulative layout shift score. */
  cls?: number
  /** Bytes transferred for the page load. */
  transferBytes?: number
  /** Number of requests during load. */
  requests?: number
}

export interface CdpCaptureResult {
  report: RuntimeReport
  shots: { name: string; path: string }[]
  /** Findings from the in-page accessibility sweep (when requested). */
  a11y: string[]
  /** Distinctiveness-debt findings (when the audit ran). */
  slop: string[]
  /** Load performance snapshot for the primary navigation. */
  perf: PerfMetrics
  /** "What a screen reader would say": linearized AX tree (when audited). */
  narration: string[]
}

/** In-page collection of web-vitals-adjacent numbers via PerformanceObserver. */
const PERF_PROBE = `(() => {
  const out = {};
  const buffered = (type) => {
    try {
      const po = new PerformanceObserver(() => {});
      po.observe({ type, buffered: true });
      const records = po.takeRecords();
      po.disconnect();
      return records;
    } catch { return []; }
  };
  const lcp = buffered('largest-contentful-paint');
  if (lcp.length > 0) out.lcpMs = Math.round(lcp[lcp.length - 1].startTime);
  let cls = 0;
  for (const e of buffered('layout-shift')) { if (!e.hadRecentInput) cls += e.value; }
  out.cls = Math.round(cls * 1000) / 1000;
  try {
    const resources = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    let bytes = nav ? (nav.transferSize || 0) : 0;
    for (const r of resources) bytes += r.transferSize || 0;
    out.transferBytes = bytes;
    out.requests = resources.length + (nav ? 1 : 0);
  } catch {}
  return out;
})()`

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
        ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        '--no-first-run',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let stderr = ''
    // CI runners can take a while to cold-start Chrome.
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL')
        reject(new Error('Chrome did not announce DevTools endpoint'))
      },
      process.env.CI ? 45000 : 15000,
    )
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
/**
 * Percentage of pixels that differ between two PNGs, computed inside
 * Chrome via canvas (no image dependency in Node). Samples every other
 * pixel; returns null when either image fails to decode.
 */
export async function pixelDiffPct(chromePath: string, pngA: Buffer, pngB: Buffer): Promise<number | null> {
  const { child, wsUrl, profileDir } = await launchChrome(chromePath)
  let connection: CdpConnection | null = null
  try {
    connection = await CdpConnection.connect(wsUrl, 10000)
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true })
    await connection.send('Runtime.enable', {}, sessionId)
    const expression = `(async () => {
      const load = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode'));
        img.src = src;
      });
      const a = await load('data:image/png;base64,${pngA.toString('base64')}');
      const b = await load('data:image/png;base64,${pngB.toString('base64')}');
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      if (w === 0 || h === 0) return null;
      const draw = (img) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const da = draw(a), db = draw(b);
      let differ = 0, total = 0;
      for (let i = 0; i < da.length; i += 8) {
        total++;
        if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) differ++;
      }
      const sizePenalty = (a.width !== b.width || a.height !== b.height) ? 1 : 0;
      return Math.min(100, (differ / total) * 100 + sizePenalty);
    })()`
    const { result } = await connection.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    return typeof result?.value === 'number' ? result.value : null
  } catch {
    return null
  } finally {
    connection?.close()
    child.kill('SIGKILL')
    setTimeout(() => fs.rmSync(profileDir, { recursive: true, force: true }), 500).unref?.()
  }
}

/**
 * Deterministic distinctiveness sweep: the checkable subset of the
 * "every AI site looks identical" tell catalog. Style debt, not
 * defects — findings feed the review prompt, never the fix loop.
 */
const SLOP_AUDIT = `(() => {
  const out = [];
  const bodyFont = (getComputedStyle(document.body).fontFamily || '').toLowerCase();
  const h1 = document.querySelector('h1,h2');
  const displayFont = h1 ? (getComputedStyle(h1).fontFamily || '').toLowerCase() : bodyFont;
  for (const tell of ['inter', 'roboto', 'arial', 'space grotesk']) {
    if (displayFont.includes(tell) || bodyFont.split(',')[0].includes(tell)) {
      out.push('generic font stack: ' + tell + ' (' + (displayFont.includes(tell) ? 'display' : 'body') + ')');
      break;
    }
  }
  const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.top > vh || r.width * r.height < vw * vh * 0.2) continue;
    const bg = getComputedStyle(el).backgroundImage || '';
    if (bg.includes('gradient')) {
      const purples = bg.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)/g) || [];
      if (purples.some((c) => { const [r2, g2, b2] = c.slice(4).split(',').map(Number); return b2 > 150 && r2 > 80 && r2 < 200 && g2 < r2; })) {
        out.push('purple/violet gradient on a hero-scale element');
        break;
      }
    }
  }
  for (const container of document.querySelectorAll('section, div')) {
    const kids = [...container.children];
    if (kids.length < 3 || kids.length > 4) continue;
    const rects = kids.map((k) => k.getBoundingClientRect());
    if (rects[0].width < 150 || rects[0].top > vh * 2) continue;
    const sameSize = rects.every((r) => Math.abs(r.width - rects[0].width) < 4 && Math.abs(r.height - rects[0].height) < 24);
    const cardish = kids.every((k) => k.querySelector('svg, img') && k.querySelector('h2,h3,h4') && k.querySelector('p'));
    if (sameSize && cardish) { out.push('identical icon-card grid (' + kids.length + ' cards)'); break; }
  }
  let emojiBullets = 0;
  for (const li of document.querySelectorAll('li')) {
    if (/^[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test((li.textContent || '').trim())) emojiBullets++;
  }
  if (emojiBullets >= 3) out.push(emojiBullets + ' emoji-bulleted list items');
  const rootStyle = getComputedStyle(document.documentElement);
  if (rootStyle.getPropertyValue('--radius').trim() === '0.5rem' && rootStyle.getPropertyValue('--primary').trim() === '222.2 47.4% 11.2%') {
    out.push('untouched shadcn default theme tokens');
  }
  return out.slice(0, 8);
})()`

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
  let slop: string[] = []
  let perf: PerfMetrics = {}
  let narration: string[] = []
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

    try {
      const { result } = await connection.send(
        'Runtime.evaluate',
        { expression: PERF_PROBE, returnByValue: true },
        sessionId,
      )
      if (result?.value && typeof result.value === 'object') perf = result.value as PerfMetrics
    } catch {
      // perf numbers are best-effort
    }

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
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: SLOP_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) slop = result.value.map(String)
      } catch {
        // best-effort
      }
      try {
        await connection.send('Accessibility.enable', {}, sessionId)
        const { nodes } = await connection.send('Accessibility.getFullAXTree', {}, sessionId)
        const interesting = new Set([
          'heading', 'link', 'button', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
          'img', 'image', 'navigation', 'main', 'banner', 'contentinfo', 'form', 'search',
          'tab', 'menuitem', 'switch', 'slider', 'alert', 'dialog', 'list',
        ])
        if (Array.isArray(nodes)) {
          for (const node of nodes) {
            if (node.ignored) continue
            const role = node.role?.value
            if (!role || !interesting.has(role)) continue
            const name = (node.name?.value ?? '').toString().trim().replace(/\s+/g, ' ').slice(0, 80)
            const level = node.properties?.find((p: any) => p.name === 'level')?.value?.value
            narration.push(`${role}${level ? ` ${level}` : ''}${name ? `: "${name}"` : ' (no accessible name)'}`)
            if (narration.length >= 80) break
          }
        }
      } catch {
        // narration is best-effort
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

  return { report, shots, a11y, slop, perf, narration }
}
