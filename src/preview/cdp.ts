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
  /** Class tokens in the DOM with no matching CSS rule (when audited). */
  phantoms: string[]
  viewTransitions: string[]
  components: string[]
  checkFailures: string[]
  webmcp: string[]
  locale: string[]
  speculation: string[]
  containers: string[]
  security: string[]
  jank: string[]
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
  // Form error announcement readiness: a form with required fields that
  // has no live region anywhere AND whose fields reference no error
  // container can never announce a validation failure to a screen
  // reader — the errors happen silently. Static, deterministic.
  const liveRegions = document.querySelectorAll('[aria-live], [role="alert"], [role="status"], output');
  let formFlags = 0;
  for (const form of document.querySelectorAll('form')) {
    if (formFlags >= 3) break;
    const required = [...form.querySelectorAll('[required], [aria-required="true"]')];
    if (required.length === 0) continue;
    const anyReferencesError = required.some((f) => f.getAttribute('aria-describedby') || f.getAttribute('aria-errormessage'));
    if (liveRegions.length === 0 && !anyReferencesError) {
      out.push('form errors silent: <form' + (form.id ? '#' + form.id : '') + '> has ' + required.length + ' required field(s) but no aria-live region and no aria-errormessage wiring — validation failures announce nothing');
      formFlags++;
    }
  }
  // Phantom IDREFs: aria-labelledby pointing at a renamed id announces
  // nothing; popovertarget pointing at nothing opens nothing. The
  // sibling of the phantom-class check, one DOM walk.
  const IDREF_ATTRS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-errormessage', 'aria-activedescendant', 'popovertarget', 'commandfor', 'for', 'list'];
  let danglers = 0;
  for (const attr of IDREF_ATTRS) {
    if (danglers >= 5) break;
    for (const el of document.querySelectorAll('[' + attr + ']')) {
      if (danglers >= 5) break;
      if (attr === 'for' && el.tagName !== 'LABEL' && el.tagName !== 'OUTPUT') continue;
      const raw = el.getAttribute(attr) || '';
      for (const id of raw.split(/\\s+/)) {
        if (!id) continue;
        const root = el.getRootNode();
        if (!root.getElementById || !root.getElementById(id)) {
          out.push('phantom idref: ' + short(el) + ' ' + attr + '="' + id + '" — no element has that id');
          danglers++;
          break;
        }
      }
    }
  }
  // Fake buttons: click handlers on non-interactive elements with no
  // role and no tabindex — mouse-only UI, invisible to keyboards and
  // screen readers alike. The div-onclick classic.
  let fakes = 0;
  for (const el of document.querySelectorAll('div[onclick], span[onclick], li[onclick], img[onclick]')) {
    if (el.closest('a[href], button, [role="button"], [role="link"]')) continue;
    if (el.hasAttribute('role') || el.hasAttribute('tabindex')) continue;
    out.push('clickable ' + short(el) + ' is not focusable and has no role — unreachable without a mouse');
    if (++fakes >= 4) break;
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
 * Replay one declared flow headlessly. Returns the failing step (1-based)
 * with detail, or the shots captured along the way.
 */
/**
 * Soft-navigation pulse (Chrome 151+): SPA route transitions get their
 * own performance entries with a navigationId tying ICP/LCP to each
 * transition — the first deterministic per-transition CWV primitive.
 * Silently empty on older Chromes (the observe() call throws).
 */
const SOFTNAV_SHIM = `(() => {
  window.__squintSoftNav = [];
  const push = (type, e) => window.__squintSoftNav.push({
    type,
    navigationId: e.navigationId || '',
    start: Math.round(e.startTime),
    value: Math.round(e.renderTime || e.duration || 0),
    url: e.name || '',
  });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => push('soft-navigation', e)))
      .observe({ type: 'soft-navigation', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => push('icp', e)))
      .observe({ type: 'interaction-contentful-paint', buffered: true });
  } catch {}
})()`

/** Fold raw soft-nav entries into one line per transition. */
export function summarizeSoftNav(entries: { type: string; navigationId: string; start: number; value: number; url: string }[]): string[] {
  const byNav = new Map<string, { url: string; start: number; icp?: number }>()
  for (const entry of entries) {
    if (entry.type === 'soft-navigation') {
      byNav.set(entry.navigationId, { url: entry.url, start: entry.start, ...byNav.get(entry.navigationId) })
    } else if (entry.type === 'icp' && entry.navigationId) {
      const nav = byNav.get(entry.navigationId) ?? { url: '', start: 0 }
      nav.icp = Math.max(nav.icp ?? 0, entry.value)
      byNav.set(entry.navigationId, nav)
    }
  }
  return [...byNav.values()]
    .sort((a, b) => a.start - b.start)
    .map((nav) => {
      const route = nav.url ? new URL(nav.url, 'http://x').pathname : '?'
      return `soft-nav → ${route}${nav.icp !== undefined ? ` · ICP ${nav.icp}ms` : ''}`
    })
}

export async function runFlow(
  chromePath: string,
  baseUrl: string,
  flow: import('./flows.js').Flow,
  outDir: string,
): Promise<{ ok: boolean; failedStep?: number; detail?: string; shots: string[]; transitions: string[]; leaks: string[]; durationMs: number }> {
  const { stepExpression } = await import('./flows.js')
  const { child, wsUrl, profileDir } = await launchChrome(chromePath)
  const startedAt = Date.now()
  const shots: string[] = []
  let transitions: string[] = []
  const leaks: string[] = []
  let connection: CdpConnection | null = null
  try {
    connection = await CdpConnection.connect(wsUrl, 10000)
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true })
    await connection.send('Page.enable', {}, sessionId)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBMCP_SHIM }, sessionId).catch(() => null)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: LOAF_SHIM }, sessionId).catch(() => null)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: SOFTNAV_SHIM }, sessionId).catch(() => null)
    await connection.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      sessionId,
    )
    const base = baseUrl.replace(/\/+$/, '')
    let stepNumber = 0
    for (const step of flow.steps) {
      stepNumber += 1
      if (step.kind === 'goto') {
        // "/" means the base itself (also keeps file:// bases working).
        const url = step.route === '/' ? base : `${base}${step.route}`
        await connection.send('Page.navigate', { url }, sessionId)
        await new Promise((resolve) => setTimeout(resolve, 1800))
        continue
      }
      if (step.kind === 'wait') {
        await new Promise((resolve) => setTimeout(resolve, step.ms))
        continue
      }
      if (step.kind === 'shot') {
        const { data } = await connection.send('Page.captureScreenshot', { format: 'png' }, sessionId)
        const outPath = path.join(outDir, `flow-${flow.name}-${step.name}.png`)
        fs.writeFileSync(outPath, Buffer.from(data, 'base64'))
        shots.push(outPath)
        continue
      }
      const expression = stepExpression(step)
      if (!expression) continue
      const { result } = await connection.send(
        'Runtime.evaluate',
        { expression, returnByValue: true },
        sessionId,
      )
      const value = result?.value as { ok: boolean; detail?: string } | undefined
      if (!value?.ok) {
        return { ok: false, failedStep: stepNumber, detail: value?.detail ?? 'step failed', shots, transitions, leaks, durationMs: Date.now() - startedAt }
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    let worstIcp = 0
    try {
      const { result } = await connection.send(
        'Runtime.evaluate',
        { expression: 'window.__squintSoftNav || []', returnByValue: true },
        sessionId,
      )
      if (Array.isArray(result?.value)) {
        transitions = summarizeSoftNav(result.value)
        for (const entry of result.value as { type: string; value: number }[]) {
          if (entry.type === 'icp' && entry.value > worstIcp) worstIcp = entry.value
        }
      }
    } catch {
      // pre-151 Chromes have nothing to report
    }
    const budget = flow.steps.find((s) => s.kind === 'budget')
    if (budget && budget.kind === 'budget' && worstIcp > budget.ms) {
      return {
        ok: false,
        detail: `soft-nav ICP budget blown: worst transition ${Math.round(worstIcp)}ms > ${budget.ms}ms budget`,
        shots,
        transitions,
        leaks,
        durationMs: Date.now() - startedAt,
      }
    }
    // Leak pulse: DOM nodes detached from the tree but retained by JS
    // after the journey — the listener-holds-the-list leak class agents
    // introduce constantly. Deterministic via DOM.getDetachedDomNodes.
    try {
      const { detachedNodes } = await connection.send('DOM.getDetachedDomNodes', {}, sessionId)
      const names = new Map<string, number>()
      let total = 0
      for (const retained of detachedNodes ?? []) {
        const walk = (node: { nodeName?: string; children?: unknown[] }) => {
          total++
          const name = (node.nodeName ?? '?').toLowerCase()
          names.set(name, (names.get(name) ?? 0) + 1)
        }
        walk((retained as { treeNode?: { nodeName?: string } }).treeNode ?? (retained as { nodeName?: string }))
      }
      if (total >= 10) {
        const top = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ×${c}`).join(', ')
        leaks.push(`leak: ${total} detached DOM subtree(s) retained after the journey (${top}) — something holds references to removed nodes`)
      }
    } catch {
      // older Chromes lack the domain
    }
    return { ok: true, shots, transitions, leaks, durationMs: Date.now() - startedAt }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err), shots, transitions, leaks, durationMs: Date.now() - startedAt }
  } finally {
    connection?.close()
    child.kill('SIGKILL')
    setTimeout(() => fs.rmSync(profileDir, { recursive: true, force: true }), 500).unref?.()
  }
}

/**
 * Percentage of pixels that differ between two PNGs, computed inside
 * Chrome via canvas (no image dependency in Node). Samples every other
 * pixel; returns null when either image fails to decode.
 */
export interface PulseDiff {
  pct: number
  /** Per-element sentences for the changed regions, worst-first. */
  sentences: string[]
  /** before | after | heatmap composite, written when the page changed. */
  triptychPath?: string
}

/**
 * Element-attributed pulse diff: the percentage says the page changed;
 * these sentences say WHAT changed. Changed pixels cluster into
 * regions (32px grid, flood-fill merge), then region centers hit-test
 * against the live page in a second tab of the same browser — one
 * launch, real DOM names, fiber owners when React is in dev.
 */
export async function pixelDiffAttributed(
  chromePath: string,
  pngA: Buffer,
  pngB: Buffer,
  url?: string,
  outPath?: string,
): Promise<PulseDiff | null> {
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
      const CELL = 32;
      const gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
      const marked = new Uint8Array(gw * gh);
      let differ = 0, total = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          total++;
          const i = (y * w + x) * 4;
          if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) {
            differ++;
            marked[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] = 1;
          }
        }
      }
      // Flood-fill marked cells into region bounding boxes.
      const seen = new Uint8Array(gw * gh);
      const regions = [];
      for (let cy = 0; cy < gh; cy++) {
        for (let cx = 0; cx < gw; cx++) {
          const start = cy * gw + cx;
          if (!marked[start] || seen[start]) continue;
          let minX = cx, maxX = cx, minY = cy, maxY = cy, cells = 0;
          const stack = [start];
          seen[start] = 1;
          while (stack.length) {
            const cell = stack.pop();
            const x = cell % gw, y = Math.floor(cell / gw);
            cells++;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const n = ny * gw + nx;
              if (marked[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
            }
          }
          regions.push({
            x: minX * CELL, y: minY * CELL,
            w: Math.min(w, (maxX + 1) * CELL) - minX * CELL,
            h: Math.min(h, (maxY + 1) * CELL) - minY * CELL,
            cells,
          });
        }
      }
      regions.sort((p, q) => q.cells - p.cells);
      const sizePenalty = (a.width !== b.width || a.height !== b.height) ? 1 : 0;
      const pct = Math.min(100, (differ / total) * 100 + sizePenalty);
      let triptych = null;
      if (pct >= 0.5) {
        // before | after | heatmap, half scale, labeled.
        const panelW = Math.round(w / 2), panelH = Math.round(h / 2), gap = 6;
        const c = document.createElement('canvas');
        c.width = panelW * 3 + gap * 2; c.height = panelH + 22;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(a, 0, 22, panelW, panelH);
        ctx.drawImage(b, panelW + gap, 22, panelW, panelH);
        ctx.globalAlpha = 0.3;
        ctx.drawImage(b, (panelW + gap) * 2, 22, panelW, panelH);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,60,40,0.75)';
        const sx = panelW / w, sy = panelH / h;
        for (let cy = 0; cy < gh; cy++) {
          for (let cx = 0; cx < gw; cx++) {
            if (!marked[cy * gw + cx]) continue;
            ctx.fillRect((panelW + gap) * 2 + cx * CELL * sx, 22 + cy * CELL * sy, CELL * sx, CELL * sy);
          }
        }
        ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
        ctx.fillText('before', 2, 14);
        ctx.fillText('after', panelW + gap + 2, 14);
        ctx.fillText('changed ' + pct.toFixed(1) + '%', (panelW + gap) * 2 + 2, 14);
        triptych = c.toDataURL('image/png');
      }
      return { pct, regions: regions.slice(0, 5), w, h, triptych };
    })()`
    const { result } = await connection.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    const value = result?.value as {
      pct: number
      regions: { x: number; y: number; w: number; h: number }[]
      w: number
      h: number
      triptych: string | null
    } | null
    if (!value || typeof value.pct !== 'number') return null
    let triptychPath: string | undefined
    if (value.triptych && outPath) {
      try {
        fs.writeFileSync(outPath, Buffer.from(value.triptych.split(',')[1] ?? '', 'base64'))
        triptychPath = outPath
      } catch {
        // the triptych is garnish
      }
    }
    if (!url || value.regions.length === 0 || value.pct < 0.5) return { pct: value.pct, sentences: [], triptychPath }

    // Second tab: the live page at the pulse viewport, hit-test centers.
    let sentences: string[] = []
    try {
      const page = await connection.send('Target.createTarget', { url: 'about:blank' })
      const attach = await connection.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
      const pageSession = attach.sessionId
      await connection.send('Runtime.enable', {}, pageSession)
      await connection.send('Page.enable', {}, pageSession)
      await connection.send(
        'Emulation.setDeviceMetricsOverride',
        { width: value.w, height: value.h, deviceScaleFactor: 1, mobile: false },
        pageSession,
      )
      await connection.send('Page.navigate', { url }, pageSession)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      const hitTest = `((regions) => regions.map((r) => {
        const el = document.elementsFromPoint(r.x + r.w / 2, r.y + r.h / 2)
          .find((e) => e !== document.documentElement && e !== document.body);
        const where = r.w + '×' + r.h + ' region @ (' + r.x + ',' + r.y + ')';
        if (!el) return where + ' changed';
        let label = el.tagName.toLowerCase();
        if (el.id) label += '#' + el.id;
        else if (el.classList[0]) label += '.' + el.classList[0];
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber\$'));
        let chain = '';
        if (key) {
          let fiber = el[key];
          const names = [];
          let hops = 0;
          while (fiber && hops < 50 && names.length < 2) {
            const t = fiber.type;
            const n = typeof t === 'function' ? (t.displayName || t.name || '') : '';
            if (n && !names.includes(n)) names.push(n);
            fiber = fiber.return; hops++;
          }
          chain = names.join(' < ');
        }
        return '<' + label + '>' + (chain ? ' (' + chain + ')' : '') + ': ' + where + ' changed';
      }))(${JSON.stringify(value.regions)})`
      const hit = await connection.send(
        'Runtime.evaluate',
        { expression: hitTest, returnByValue: true },
        pageSession,
      )
      if (Array.isArray(hit.result?.value)) sentences = hit.result.value.map(String)
    } catch {
      // attribution is a bonus on top of the percentage
    }
    return { pct: value.pct, sentences, triptychPath }
  } catch {
    return null
  } finally {
    connection?.close()
    child.kill('SIGKILL')
    setTimeout(() => fs.rmSync(profileDir, { recursive: true, force: true }), 500).unref?.()
  }
}

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
  // APCA (the contrast model that graduated in DevTools 149): body text
  // under |Lc| 60 reads as fog even when it squeaks past WCAG AA.
  const chan = (v) => Math.pow(v / 255, 2.4);
  const lum = (rgb) => {
    const m = rgb.match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/);
    if (!m) return null;
    return 0.2126729 * chan(+m[1]) + 0.7151522 * chan(+m[2]) + 0.0721750 * chan(+m[3]);
  };
  const apca = (txt, bg) => {
    let yt = lum(txt), yb = lum(bg);
    if (yt === null || yb === null) return null;
    const clamp = (y) => (y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y);
    yt = clamp(yt); yb = clamp(yb);
    const c = yb > yt ? (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14 : (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
    return Math.abs(c) < 0.1 ? 0 : Math.round((Math.abs(c) - 0.027) * 100);
  };
  let apcaFlagged = 0;
  for (const p of document.querySelectorAll('p, li, td, span')) {
    if (apcaFlagged >= 2) break;
    const text = (p.textContent || '').trim();
    if (text.length < 40) continue;
    const cs = getComputedStyle(p);
    if (parseFloat(cs.fontSize) >= 24) continue;
    let bgEl = p, bg = 'rgba(0, 0, 0, 0)';
    while (bgEl) {
      const b = getComputedStyle(bgEl).backgroundColor;
      if (b && !b.includes('0, 0, 0, 0')) { bg = b; break; }
      bgEl = bgEl.parentElement;
    }
    if (bg.includes('0, 0, 0, 0')) bg = 'rgb(255, 255, 255)';
    const lc = apca(cs.color, bg);
    if (lc !== null && lc > 0 && lc < 60) {
      out.push('low APCA contrast: Lc ' + lc + ' on <' + p.tagName.toLowerCase() + '> body text ("' + text.slice(0, 40) + '…") — fog, not elegance');
      apcaFlagged++;
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
  // The Purple Problem: the 2026 AI-landing fingerprint. Dominant brand
  // hue in the 250-280deg indigo/violet band, paired with a gradient.
  const toHue = (rgb) => {
    const m = rgb.match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/);
    if (!m) return null;
    const r = +m[1] / 255, g = +m[2] / 255, b = +m[3] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.08) return null;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
    return h;
  };
  let indigoHits = 0, gradientHits = 0;
  for (const el of document.querySelectorAll('a, button, [class*="btn"], [class*="cta"], .hero, header, h1')) {
    const cs = getComputedStyle(el);
    const h = toHue(cs.backgroundColor);
    if (h !== null && h >= 250 && h <= 285) indigoHits++;
    if ((cs.backgroundImage || '').includes('gradient')) gradientHits++;
  }
  if (indigoHits >= 2) {
    out.push('the Purple Problem: ' + indigoHits + ' prominent element(s) in the indigo/violet band (250-285deg)' + (gradientHits > 0 ? ' plus gradients' : '') + ' — the saturated 2026 AI-landing tell; pick a hue the domain does not predict');
  }
  // Exactly-three equal cards with icon + heading, the SaaS reflex.
  const cardSets = new Map();
  for (const el of document.querySelectorAll('[class*="card"], [class*="feature"]')) {
    const parent = el.parentElement;
    if (!parent) continue;
    const key = parent;
    cardSets.set(key, (cardSets.get(key) || 0) + 1);
  }
  for (const [parent, count] of cardSets) {
    if (count === 3) {
      const kids = [...parent.children].filter((c) => /card|feature/i.test(c.className));
      const widths = kids.map((c) => Math.round(c.getBoundingClientRect().width));
      if (widths.length === 3 && Math.max(...widths) - Math.min(...widths) < 8 && widths[0] > 0) {
        out.push('three equal feature cards in a row — the SaaS-template reflex; vary the rhythm or the count');
        break;
      }
    }
  }
  // Weightless CTA copy from the AI dictionary.
  for (const el of document.querySelectorAll('a, button')) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (/^(get started|build faster|ship smarter|start building|get started free)$/.test(t)) {
      out.push('template CTA copy: "' + (el.textContent || '').trim() + '" — say what the button actually does');
      break;
    }
  }
  return out.slice(0, 12);
})()`

/**
 * Phantom-class check: class tokens present in the DOM but absent from
 * every same-origin stylesheet are silently unstyled — the signature of
 * hallucinated or version-mismatched utility classes (Tailwind v3
 * spellings in v4 projects, misspellings, never-compiled concatenations).
 */
const PHANTOM_AUDIT = `(() => {
  const defined = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.selectorText) {
          for (const m of rule.selectorText.matchAll(/\\.((?:[\\w-]|\\\\.)+)/g)) {
            defined.add(m[1].replace(/\\\\(.)/g, '$1'));
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }
  if (defined.size < 10) return []; // no CSSOM visibility — stay silent
  const seen = new Map();
  for (const el of document.querySelectorAll('[class]')) {
    for (const cls of el.classList) {
      if (cls.length < 3) continue;
      if (!defined.has(cls) && !seen.has(cls)) seen.set(cls, el.tagName.toLowerCase());
    }
  }
  const out = [];
  for (const [cls, tag] of seen) {
    out.push(cls + ' (on <' + tag + '>)');
    if (out.length >= 12) break;
  }
  return out;
})()`

/**
 * View-transitions correctness: duplicate view-transition-name values on
 * simultaneously rendered elements make the browser skip the whole
 * transition (a console error nobody reads); ::view-transition CSS with
 * no prefers-reduced-motion guard animates for the users who asked it
 * not to. Nobody else checks this category.
 */
const VT_AUDIT = `(() => {
  const findings = [];
  const names = new Map();
  for (const el of document.querySelectorAll('*')) {
    const name = getComputedStyle(el).viewTransitionName;
    if (name && name !== 'none' && name !== 'auto') {
      const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
      const list = names.get(name) || [];
      list.push(label);
      names.set(name, list);
    }
  }
  for (const [name, els] of names) {
    if (els.length > 1) {
      findings.push('duplicate view-transition-name "' + name + '" on ' + els.length + ' elements (' + els.slice(0, 3).join(', ') + ') — the browser skips the entire transition');
    }
  }
  let vtCss = false;
  let reducedGuard = false;
  const walk = (list, inReduced) => {
    for (const rule of list) {
      const media = rule.media && rule.media.mediaText || '';
      const nowReduced = inReduced || /prefers-reduced-motion/.test(media);
      if (rule.cssText && rule.cssText.includes('::view-transition')) {
        vtCss = true;
        if (nowReduced) reducedGuard = true;
      }
      if (nowReduced && rule.cssText && /animation|transition/.test(rule.cssText)) reducedGuard = true;
      if (rule.cssRules) walk(rule.cssRules, nowReduced);
    }
  };
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    try { walk(rules, false); } catch {}
  }
  if ((names.size > 0 || vtCss) && !reducedGuard) {
    findings.push('view transitions declared with no prefers-reduced-motion handling anywhere in the CSS — motion-sensitive users get the full animation');
  }
  return findings;
})()`

/**
 * Fiber probe: react-dom stamps every host element with a
 * __reactFiber$ key in dev builds. Walking fiber.return from landmark
 * elements names the owning components without any build-time tagger —
 * the map that lets a reviewing engine say "the overflow is in
 * <Hero>", not "somewhere under main".
 */
const FIBER_AUDIT = `(() => {
  const fiberKey = (el) => Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  const all = document.querySelectorAll('*');
  let reactSeen = false;
  for (let i = 0; i < all.length && i < 300; i++) {
    if (fiberKey(all[i])) { reactSeen = true; break; }
  }
  if (!reactSeen) return [];
  const nameOf = (t) => {
    if (typeof t === 'function') return t.displayName || t.name || '';
    if (t && typeof t === 'object') return t.displayName || (t.render && (t.render.displayName || t.render.name)) || '';
    return '';
  };
  const chainFor = (el) => {
    const key = fiberKey(el);
    if (!key) return null;
    let fiber = el[key];
    const names = [];
    let hops = 0;
    while (fiber && hops < 50 && names.length < 3) {
      const n = nameOf(fiber.type);
      if (n && !names.includes(n)) names.push(n);
      fiber = fiber.return;
      hops++;
    }
    return names.length > 0 ? names.join(' < ') : null;
  };
  const out = [];
  for (const sel of ['header', 'nav', 'main', 'footer', 'h1', 'h2', 'form', 'aside', '[role="dialog"]', 'table']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const chain = chainFor(el);
    if (chain) out.push(sel + ' — ' + chain);
    if (out.length >= 10) break;
  }
  return out;
})()`

/**
 * WebMCP recorder: pages register typed tools for agents via
 * navigator.modelContext (Chrome 146+). Injected before any page script
 * runs, this shim records registrations — and stands in for the API on
 * older Chromes so instrumented pages still work headlessly. What a
 * page declares is capability surface squint should know about.
 */
const WEBMCP_SHIM = `(() => {
  window.__squintWebMcp = [];
  window.__squintWebMcpMeta = [];
  const record = (tools, surface) => {
    for (const t of tools || []) {
      if (!t || !t.name) continue;
      window.__squintWebMcp.push(t.name + (t.description ? ' — ' + t.description : ''));
      const schema = t.inputSchema || t.input_schema || (t.parameters);
      window.__squintWebMcpMeta.push({
        name: t.name,
        surface: surface,
        hasSchema: !!schema,
        schemaValid: schema ? (schema.type === 'object' && typeof schema.properties === 'object') : true,
      });
    }
  };
  const wrap = (target, surface) => {
    const provide = target.provideContext && target.provideContext.bind(target);
    target.provideContext = (params) => { record(params && params.tools, surface); return provide ? provide(params) : undefined; };
    const register = target.registerTool && target.registerTool.bind(target);
    target.registerTool = (tool) => { record([tool], surface); return register ? register(tool) : undefined; };
    return target;
  };
  // The spec moved the API to document.modelContext (Chrome 150 drops
  // the navigator location); shim both so either registration is seen.
  wrap(document.modelContext || (document.modelContext = {}), 'document');
  wrap(navigator.modelContext || (navigator.modelContext = {}), 'navigator');
})()`

const WEBMCP_PARITY = `(() => {
  const out = [];
  const meta = window.__squintWebMcpMeta || [];
  for (const t of meta) {
    if (t.surface === 'navigator') out.push('webmcp: tool "' + t.name + '" registered on the deprecated navigator.modelContext — Chrome 150 drops it; use document.modelContext');
    if (!t.hasSchema) out.push('webmcp: tool "' + t.name + '" declares no input schema — agents cannot call it safely');
    else if (!t.schemaValid) out.push('webmcp: tool "' + t.name + '" has an invalid input schema (expect type:object with properties)');
    if (out.length >= 6) return out;
  }
  // Form coverage: interactive forms with no declared tool are invisible
  // to agents that would otherwise fill them.
  if (meta.length > 0) {
    const forms = document.querySelectorAll('form');
    if (forms.length > 0 && meta.length < forms.length) {
      out.push('webmcp: ' + forms.length + ' form(s) but only ' + meta.length + ' declared tool(s) — some forms have no agent affordance');
    }
  }
  return out.slice(0, 6);
})()`

/**
 * LoAF jank attribution: Long Animation Frames (W3C FPWD, Chrome 123+)
 * name the script and function behind every main-thread frame ≥50ms —
 * the difference between "the page janks" and "the onScroll you just
 * wrote costs 120ms a frame". Buffered observer installed before any
 * page script; a scripted scroll after settle provokes interaction
 * frames the load never shows.
 */
const LOAF_SHIM = `(() => {
  window.__squintLoaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 50) continue;
        const s = (e.scripts && e.scripts[0]) || {};
        window.__squintLoaf.push({
          duration: Math.round(e.duration),
          fn: s.sourceFunctionName || '',
          url: (s.sourceURL || s.name || '').split('/').pop() || '',
          invoker: s.invoker || '',
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
})()`

const SCRIPTED_SCROLL = `(async () => {
  const half = Math.max(0, (document.body.scrollHeight - innerHeight) / 2);
  window.scrollTo({ top: half, behavior: 'smooth' });
  await new Promise((r) => setTimeout(r, 400));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await new Promise((r) => setTimeout(r, 300));
  const seen = new Map();
  for (const e of window.__squintLoaf || []) {
    const key = e.fn + '@' + e.url + '@' + e.invoker;
    const prev = seen.get(key);
    if (!prev || e.duration > prev.duration) seen.set(key, e);
  }
  return [...seen.values()]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 6)
    .map((e) => e.duration + 'ms frame — ' + (e.fn || e.invoker || 'script') + (e.url ? ' @ ' + e.url : ''));
})()`

/**
 * Locale pulse: pseudo-localization surfaces truncation and hardcoded
 * direction without a single real translation. Text nodes get accents
 * plus ~40% expansion (the industry survival bar), then clipped
 * elements report; dir=rtl exposes text-align:left hardcodes (computed
 * 'start' flips to right under RTL — explicit left doesn't). Runs LAST:
 * it mutates the page.
 */
const LOCALE_AUDIT = `(async () => {
  const findings = [];
  const label = (el) => {
    let out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    else if (el.classList[0]) out += '.' + el.classList[0];
    return out;
  };
  const MAP = { a:'á', e:'é', i:'í', o:'ó', u:'ü', A:'Á', E:'É', I:'Í', O:'Ó', U:'Ü', n:'ñ', N:'Ñ' };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return n.textContent.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes.slice(0, 400)) {
    const text = node.textContent;
    const accented = text.replace(/[aeiouAEIOUnN]/g, (c) => MAP[c] || c);
    const pad = '·'.repeat(Math.ceil(text.trim().length * 0.4));
    node.textContent = accented + pad;
  }
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  const clipped = new Set();
  for (const el of document.querySelectorAll('button, a, h1, h2, h3, [class*="btn"], [class*="badge"], nav *, th, td, li, label, span, p')) {
    if (clipped.size >= 6) break;
    if (el.children.length > 0) continue;
    if (el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0) {
      const key = label(el);
      if (!clipped.has(key)) {
        clipped.add(key);
        findings.push('locale: <' + key + '> clips at +40% text expansion — real translations will truncate here');
      }
    }
  }
  document.documentElement.setAttribute('dir', 'rtl');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120)));
  let leftHardcodes = 0;
  for (const el of document.querySelectorAll('p, h1, h2, h3, li, td, label, div')) {
    if (leftHardcodes >= 3) break;
    const text = (el.textContent || '').trim();
    if (text.length < 10 || el.children.length > 2) continue;
    if (getComputedStyle(el).textAlign === 'left') {
      findings.push('locale: <' + label(el) + '> hardcodes text-align:left — ignores RTL (use start)');
      leftHardcodes++;
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 4) {
    findings.push('locale: the page overflows horizontally under RTL');
  }
  return findings;
})()`

/**
 * Deceptive-design check: the deterministic subset of the dark-pattern
 * taxonomy (arXiv 2607.20690 unifies 19 principles; these four are
 * DOM-checkable without judgment). Agents reproduce these patterns
 * from training data without malice — which is exactly why a
 * deterministic tripwire beats a style guide.
 */
const DECEPTION_AUDIT = `(() => {
  const out = [];
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id; else if (el.classList[0]) s += '.' + el.classList[0];
    return s;
  };
  // 1. Preselected consent
  for (const box of document.querySelectorAll('input[type="checkbox"]:checked')) {
    const scope = (box.closest('label') || box.parentElement || box);
    const text = (scope.textContent || '').slice(0, 160);
    if (/subscribe|newsletter|marketing|offers|promotions|updates|share my|third.part/i.test(text)) {
      out.push('deceptive: preselected consent checkbox — "' + text.trim().slice(0, 60) + '" starts opted in');
    }
    if (out.length >= 6) return out;
  }
  // 2. Urgency countdowns
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (text.length > 0 && text.length < 80 && /\b\d{1,2}:\d{2}(:\d{2})?\b/.test(text) && /only|hurry|left|expires|ends|limited|last chance/i.test(text)) {
      out.push('deceptive: urgency countdown on <' + label(el) + '> ("' + text.slice(0, 50) + '") — verify it is real, not theater');
      break;
    }
  }
  // 3 + 4. Buried decline / confirmshaming inside consent surfaces
  for (const surface of document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="cookie"], [class*="consent"], [class*="banner"]')) {
    const buttons = [...surface.querySelectorAll('button, a, [role="button"]')];
    const accept = buttons.find((b) => /accept|agree|allow|got it|yes/i.test(b.textContent || ''));
    const decline = buttons.find((b) => /decline|reject|refuse|no thanks|later|manage/i.test(b.textContent || ''));
    if (accept && decline) {
      const ar = accept.getBoundingClientRect(), dr = decline.getBoundingClientRect();
      const aSize = parseFloat(getComputedStyle(accept).fontSize), dSize = parseFloat(getComputedStyle(decline).fontSize);
      if ((dr.width * dr.height) < (ar.width * ar.height) * 0.55 || dSize < aSize - 2) {
        out.push('deceptive: <' + label(decline) + '> is visually buried next to <' + label(accept) + '> — equal choices deserve equal weight');
      }
    }
    for (const b of buttons) {
      if (/no thanks,? i (don.?t|hate|prefer)|i don.?t want to (save|improve|protect)/i.test(b.textContent || '')) {
        out.push('deceptive: confirmshaming copy on <' + label(b) + '> ("' + (b.textContent || '').trim().slice(0, 50) + '")');
      }
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
})()`

/**
 * Container-query disconnect check: @container rules with no element
 * declaring container-type are ALL dead — the component never responds
 * to its container, and nothing errors. The reverse (declared
 * containers, zero rules) is setup without payoff. Both are the
 * write-the-CSS-forget-the-wiring class agents produce.
 */
const CONTAINER_AUDIT = `(() => {
  const out = [];
  let containerRules = 0;
  const walk = (rules) => {
    for (const rule of rules) {
      try {
        if (rule.cssText && rule.cssText.trim().startsWith('@container')) containerRules++;
        if (rule.cssRules) walk(rule.cssRules);
      } catch {}
    }
  };
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    walk(rules);
  }
  let containers = 0;
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length && i < 1500; i++) {
    const ct = getComputedStyle(all[i]).containerType;
    if (ct && ct !== 'normal') containers++;
  }
  if (containerRules > 0 && containers === 0) {
    out.push('container queries: ' + containerRules + ' @container rule(s) but no element declares container-type — every rule is dead; add container-type to the component wrappers');
  } else if (containers > 0 && containerRules === 0) {
    out.push('container queries: ' + containers + ' element(s) declare container-type but no @container rules exist — setup without payoff');
  }
  // Anchor positioning: position-anchor pointing at an anchor-name
  // nobody declares leaves the positioned element at its fallback
  // forever — silently, like every disconnect in this family.
  const anchorNames = new Set();
  const anchorRefs = new Map();
  for (let i = 0; i < all.length && i < 1500; i++) {
    const cs = getComputedStyle(all[i]);
    const name = cs.anchorName;
    if (name && name !== 'none') for (const n of name.split(',')) anchorNames.add(n.trim());
    const ref = cs.positionAnchor;
    if (ref && ref !== 'auto' && ref !== 'none') anchorRefs.set(ref.trim(), all[i].tagName.toLowerCase());
  }
  for (const [ref, tag] of anchorRefs) {
    if (!anchorNames.has(ref)) {
      out.push('anchor positioning: <' + tag + '> targets ' + ref + ' but nothing declares that anchor-name — it will sit at its fallback forever');
    }
  }
  return out;
})()`

/**
 * Security sniff: the runtime vantage sees SERVED bytes — a secret
 * that survived the build is in the bundle no matter what the repo
 * says (400+ exposed keys across 5,600 scanned vibe-coded apps), and
 * "authorization" that only hides DOM ships the goods to everyone.
 * Findings redact to a prefix; squint never echoes a whole key.
 */
const SECURITY_AUDIT = `(async () => {
  const out = [];
  const PATTERNS = [
    [/sk_live_[0-9a-zA-Z]{20,}/g, 'Stripe live secret key'],
    [/sk-[A-Za-z0-9]{32,}/g, 'API secret key (sk-…)'],
    [/AKIA[0-9A-Z]{16}/g, 'AWS access key id'],
    [/AIza[0-9A-Za-z_-]{35}/g, 'Google API key'],
    [/gh[pos]_[A-Za-z0-9]{30,}/g, 'GitHub token'],
  ];
  const scan = (text, where) => {
    for (const [re, label] of PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) out.push('secret: ' + label + ' in ' + where + ' ("' + m[0].slice(0, 10) + '…" redacted)');
    }
    const jwt = /eyJ[A-Za-z0-9_-]{16,}\.(eyJ[A-Za-z0-9_-]{16,})\./.exec(text);
    if (jwt) {
      try {
        const payload = atob(jwt[1].replace(/-/g, '+').replace(/_/g, '/'));
        if (payload.includes('service_role')) out.push('secret: service-role JWT in ' + where + ' — full database access for every visitor');
      } catch {}
    }
  };
  for (const script of document.querySelectorAll('script:not([src])')) {
    scan(script.textContent || '', 'an inline script');
    if (out.length >= 6) break;
  }
  const sameOrigin = [...document.querySelectorAll('script[src]')]
    .map((s) => s.src)
    .filter((src) => { try { return new URL(src).origin === location.origin; } catch { return false; } })
    .slice(0, 8);
  for (const src of sameOrigin) {
    if (out.length >= 6) break;
    try {
      const text = await (await fetch(src)).text();
      scan(text.slice(0, 400000), src.split('/').pop() || src);
    } catch {}
  }
  try {
    for (let i = 0; i < localStorage.length && out.length < 8; i++) {
      const key = localStorage.key(i);
      scan(localStorage.getItem(key) || '', 'localStorage["' + key + '"]');
    }
  } catch {}
  // Client-side gates: privileged content shipped hidden to everyone.
  for (const el of document.querySelectorAll('[id*="admin" i], [class*="admin" i], [id*="premium" i], [class*="premium" i]')) {
    if (out.length >= 10) break;
    const cs = getComputedStyle(el);
    const hidden = cs.display === 'none' || cs.visibility === 'hidden';
    if (hidden && ((el.textContent || '').trim().length > 120 || el.querySelector('button, a[href], input'))) {
      let label = el.tagName.toLowerCase();
      if (el.id) label += '#' + el.id; else if (el.classList[0]) label += '.' + el.classList[0];
      out.push('client-side gate: <' + label + '> ships hidden privileged content to every visitor — hiding is not authorization');
    }
  }
  return out;
})()`

export async function cdpCapture(
  chromePath: string,
  url: string,
  outDir: string,
  viewports: readonly CdpShot[],
  settleMs = 2500,
  audit = false,
  checks: { name: string; source: string }[] = [],
): Promise<CdpCaptureResult> {
  const { child, wsUrl, profileDir } = await launchChrome(chromePath)
  const report: RuntimeReport = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  const shots: { name: string; path: string }[] = []
  let a11y: string[] = []
  let slop: string[] = []
  let perf: PerfMetrics = {}
  let narration: string[] = []
  let phantoms: string[] = []
  let viewTransitions: string[] = []
  let components: string[] = []
  const checkFailures: string[] = []
  let webmcp: string[] = []
  let locale: string[] = []
  const speculation: string[] = []
  let containers: string[] = []
  let security: string[] = []
  let jank: string[] = []
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
    connection.on('Preload.ruleSetUpdated', (params) => {
      const rs = params.ruleSet
      if (rs?.errorType) {
        speculation.push(`speculation: rule set invalid (${rs.errorType}) — ${String(rs.errorMessage ?? '').slice(0, 120)}`)
      }
    })
    connection.on('Preload.prefetchStatusUpdated', (params) => {
      if (params.status === 'Failure') {
        speculation.push(`speculation: prefetch failed for ${params.prefetchUrl ?? '?'}`)
      }
    })
    connection.on('Preload.prerenderStatusUpdated', (params) => {
      if (params.status === 'Failure') {
        speculation.push(`speculation: prerender failed${params.disallowedMojoInterface ? ` (${params.disallowedMojoInterface})` : ''}${params.prerenderStatus ? ` — ${params.prerenderStatus}` : ''}`)
      }
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
    await connection.send('Preload.enable', {}, sessionId).catch(() => null)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBMCP_SHIM }, sessionId).catch(() => null)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: LOAF_SHIM }, sessionId).catch(() => null)
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
    try {
      const { result } = await connection.send(
        'Runtime.evaluate',
        { expression: SCRIPTED_SCROLL, returnByValue: true, awaitPromise: true },
        sessionId,
      )
      if (Array.isArray(result?.value)) jank = result.value.map(String)
    } catch {
      // best-effort
    }
    try {
      const { result } = await connection.send(
        'Runtime.evaluate',
        { expression: 'window.__squintWebMcp || []', returnByValue: true },
        sessionId,
      )
      if (Array.isArray(result?.value)) webmcp = result.value.map(String).slice(0, 12)
    } catch {
      // best-effort
    }
    for (const check of checks) {
      try {
        const { result, exceptionDetails } = await connection.send(
          'Runtime.evaluate',
          { expression: check.source, returnByValue: true, timeout: 2000 },
          sessionId,
        )
        if (exceptionDetails) {
          checkFailures.push(`${check.name}: threw ${exceptionDetails.exception?.description?.split('\n')[0] ?? exceptionDetails.text ?? 'an error'}`)
        } else if (Array.isArray(result?.value)) {
          for (const finding of result.value.slice(0, 5)) checkFailures.push(`${check.name}: ${String(finding)}`)
        }
      } catch {
        // a hung check never blocks the probe
      }
      if (checkFailures.length >= 15) break
    }


    if (audit) {
      // Keyboard journey: real Tab keystrokes (trusted events, so
      // :focus-visible behaves), asserting a visible focus indicator at
      // every stop. Static sweeps can't see this — behavior can.
      const kbdFindings: string[] = []
      try {
        const seen: string[] = []
        let trapped: string | null = null
        for (let i = 0; i < 12; i++) {
          await connection.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
          await connection.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
          const { result } = await connection.send(
            'Runtime.evaluate',
            {
              expression: `(() => {
                const el = document.activeElement;
                if (!el || el === document.body || el === document.documentElement) return null;
                let label = el.tagName.toLowerCase();
                if (el.id) label += '#' + el.id;
                else if (el.classList[0]) label += '.' + el.classList[0];
                const cs = getComputedStyle(el);
                const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
                return { label, visible };
              })()`,
              returnByValue: true,
            },
            sessionId,
          )
          const stop = result?.value as { label: string; visible: boolean } | null
          if (!stop) continue
          if (seen.length > 0 && seen[seen.length - 1] === stop.label && seen.filter((s) => s === stop.label).length >= 2) {
            trapped = stop.label
            break
          }
          seen.push(stop.label)
          if (!stop.visible) kbdFindings.push(`keyboard: focus invisible on <${stop.label}> (tab stop ${seen.length}) — outline and box-shadow both none`)
        }
        if (trapped) kbdFindings.push(`keyboard: focus trapped at <${trapped}> — Tab cannot leave it`)
        if (seen.length === 0) kbdFindings.push('keyboard: no tabbable elements — the page is unreachable without a mouse')
        // Return focus to the top so later audits see the resting state.
        await connection.send('Runtime.evaluate', { expression: 'document.activeElement && document.activeElement.blur()' }, sessionId).catch(() => null)
      } catch {
        // keyboard journey is best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: A11Y_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) a11y = result.value.map(String)
        a11y.push(...kbdFindings)
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
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: WEBMCP_PARITY, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) slop.push(...result.value.map(String))
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: PHANTOM_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) phantoms = result.value.map(String)
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: SECURITY_AUDIT, returnByValue: true, awaitPromise: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) security = result.value.map(String)
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: CONTAINER_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) containers = result.value.map(String)
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: DECEPTION_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) slop.push(...result.value.map(String))
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: VT_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) viewTransitions = result.value.map(String)
      } catch {
        // best-effort
      }
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: FIBER_AUDIT, returnByValue: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) components = result.value.map(String)
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
          // 2x for review shots: sub-pixel border/kerning slop is
          // invisible at 1x. The pulse stays 1x — its diff math and
          // hit-testing assume CSS pixels.
          deviceScaleFactor: viewport.name === 'pulse' ? 1 : 2,
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

    if (audit) {
      // Forced-colors: Windows High Contrast substitutes system colors;
      // text that computes to its own background goes invisible, and
      // nobody regression-tests the mode. Non-destructive emulation.
      try {
        await connection.send(
          'Emulation.setEmulatedMedia',
          { features: [{ name: 'forced-colors', value: 'active' }] },
          sessionId,
        )
        await new Promise((resolve) => setTimeout(resolve, 200))
        const { result } = await connection.send(
          'Runtime.evaluate',
          {
            expression: `(() => {
              const out = [];
              for (const el of document.querySelectorAll('button, a, [role="button"], input[type="submit"]')) {
                if (out.length >= 5) break;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || !el.textContent || !el.textContent.trim()) continue;
                if (cs.color === cs.backgroundColor) {
                  let label = el.tagName.toLowerCase();
                  if (el.id) label += '#' + el.id; else if (el.classList[0]) label += '.' + el.classList[0];
                  out.push('forced-colors: <' + label + '> text matches its background — invisible in high-contrast mode');
                }
              }
              return out;
            })()`,
            returnByValue: true,
          },
          sessionId,
        )
        if (Array.isArray(result?.value)) a11y.push(...result.value.map(String))
        await connection.send('Emulation.setEmulatedMedia', { features: [] }, sessionId)
      } catch {
        // best-effort
      }
      // Print: emulate the media type and catch blank or nav-polluted output.
      try {
        await connection.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId)
        await new Promise((resolve) => setTimeout(resolve, 200))
        const { result } = await connection.send(
          'Runtime.evaluate',
          {
            expression: `(() => {
              const out = [];
              const bodyH = document.body.getBoundingClientRect().height;
              if (getComputedStyle(document.body).display === 'none' || bodyH < 40) {
                out.push('print: the page prints blank');
              }
              for (const el of document.querySelectorAll('nav, aside')) {
                if (getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 40) {
                  out.push('print: <' + el.tagName.toLowerCase() + '> still renders in print output');
                  break;
                }
              }
              return out;
            })()`,
            returnByValue: true,
          },
          sessionId,
        )
        if (Array.isArray(result?.value)) slop.push(...result.value.map(String))
        await connection.send('Emulation.setEmulatedMedia', { media: '' }, sessionId)
      } catch {
        // best-effort
      }
      // The locale pulse runs dead last: it rewrites the page's text.
      try {
        const { result } = await connection.send(
          'Runtime.evaluate',
          { expression: LOCALE_AUDIT, returnByValue: true, awaitPromise: true },
          sessionId,
        )
        if (Array.isArray(result?.value)) locale = result.value.map(String)
      } catch {
        // best-effort
      }
    }
  } finally {
    connection?.close()
    child.kill('SIGKILL')
    setTimeout(() => fs.rmSync(profileDir, { recursive: true, force: true }), 500).unref?.()
  }

  return { report, shots, a11y, slop, perf, narration, phantoms, viewTransitions, components, checkFailures, webmcp, jank, locale, speculation, containers, security }
}
