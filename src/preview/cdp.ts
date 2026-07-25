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
export async function runFlow(
  chromePath: string,
  baseUrl: string,
  flow: import('./flows.js').Flow,
  outDir: string,
): Promise<{ ok: boolean; failedStep?: number; detail?: string; shots: string[] }> {
  const { stepExpression } = await import('./flows.js')
  const { child, wsUrl, profileDir } = await launchChrome(chromePath)
  const shots: string[] = []
  let connection: CdpConnection | null = null
  try {
    connection = await CdpConnection.connect(wsUrl, 10000)
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true })
    await connection.send('Page.enable', {}, sessionId)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: WEBMCP_SHIM }, sessionId).catch(() => null)
    await connection.send('Page.addScriptToEvaluateOnNewDocument', { source: LOAF_SHIM }, sessionId).catch(() => null)
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
        return { ok: false, failedStep: stepNumber, detail: value?.detail ?? 'step failed', shots }
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    return { ok: true, shots }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err), shots }
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
  const record = (tools) => {
    for (const t of tools || []) {
      if (t && t.name) window.__squintWebMcp.push(t.name + (t.description ? ' — ' + t.description : ''));
    }
  };
  const wrap = (target) => {
    const provide = target.provideContext && target.provideContext.bind(target);
    target.provideContext = (params) => { record(params && params.tools); return provide ? provide(params) : undefined; };
    const register = target.registerTool && target.registerTool.bind(target);
    target.registerTool = (tool) => { record([tool]); return register ? register(tool) : undefined; };
    return target;
  };
  // The spec moved the API to document.modelContext (Chrome 150 drops
  // the navigator location); shim both so either registration is seen.
  wrap(document.modelContext || (document.modelContext = {}));
  wrap(navigator.modelContext || (navigator.modelContext = {}));
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

  return { report, shots, a11y, slop, perf, narration, phantoms, viewTransitions, components, checkFailures, webmcp, jank }
}
