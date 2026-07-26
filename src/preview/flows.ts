import fs from 'node:fs'
import path from 'node:path'

/**
 * Declared interaction flows: `.squint/flows/*.flow` scripts replayed
 * headlessly. Declared beats recorded for a harness — deterministic,
 * diffable, and the engine can write them when asked ("add a flow for
 * the signup happy path"). Static renders miss interactive breakage;
 * flows catch it.
 *
 * Syntax (one step per line, # comments):
 *   goto /pricing
 *   click Sign up            (CSS selector, or visible-text match)
 *   fill #email me@x.com
 *   press Enter
 *   expect Check your inbox
 *   shot after-signup
 */
export type FlowStep =
  | { kind: 'goto'; route: string }
  | { kind: 'click'; target: string }
  | { kind: 'fill'; selector: string; value: string }
  | { kind: 'press'; key: string }
  | { kind: 'expect'; text: string }
  | { kind: 'shot'; name: string }
  | { kind: 'hover'; target: string }
  | { kind: 'scroll'; target: string }
  | { kind: 'wait'; ms: number }

export interface Flow {
  name: string
  steps: FlowStep[]
}

export function parseFlow(name: string, text: string): Flow | null {
  const steps: FlowStep[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const [verb, ...rest] = line.split(/\s+/)
    const arg = rest.join(' ')
    switch (verb) {
      case 'goto':
        steps.push({ kind: 'goto', route: arg.startsWith('/') ? arg : `/${arg}` })
        break
      case 'click':
        steps.push({ kind: 'click', target: arg })
        break
      case 'fill': {
        const [selector, ...valueParts] = rest
        if (!selector || valueParts.length === 0) return null
        steps.push({ kind: 'fill', selector, value: valueParts.join(' ') })
        break
      }
      case 'press':
        steps.push({ kind: 'press', key: arg })
        break
      case 'expect':
        steps.push({ kind: 'expect', text: arg })
        break
      case 'shot':
        steps.push({ kind: 'shot', name: arg.replace(/[^a-zA-Z0-9-]/g, '-') })
        break
      case 'hover':
        steps.push({ kind: 'hover', target: arg })
        break
      case 'scroll':
        steps.push({ kind: 'scroll', target: arg || 'bottom' })
        break
      case 'wait': {
        const ms = Number.parseInt(arg, 10)
        if (!Number.isInteger(ms) || ms < 0 || ms > 10000) return null
        steps.push({ kind: 'wait', ms })
        break
      }
      default:
        return null // unknown verbs invalidate the flow loudly, not silently
    }
  }
  return steps.length > 0 ? { name, steps } : null
}

export function loadFlows(cwd: string): Flow[] {
  const dir = path.join(cwd, '.squint', 'flows')
  let entries: string[]
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.flow'))
  } catch {
    return []
  }
  const flows: Flow[] = []
  for (const entry of entries.sort()) {
    try {
      const flow = parseFlow(entry.replace(/\.flow$/, ''), fs.readFileSync(path.join(dir, entry), 'utf8'))
      if (flow) flows.push(flow)
    } catch {
      // unreadable flows never break a run
    }
  }
  return flows
}

/** The in-page step executors, evaluated via CDP. */
export function stepExpression(step: FlowStep): string | null {
  switch (step.kind) {
    case 'click':
      return `(() => {
        const target = ${JSON.stringify(step.target)};
        let el = null;
        try { el = document.querySelector(target); } catch {}
        if (!el) {
          const all = [...document.querySelectorAll('a, button, [role=button], input[type=submit], summary, label')];
          el = all.find((e) => (e.textContent || '').trim().toLowerCase().includes(target.toLowerCase()));
        }
        if (!el) return { ok: false, detail: 'no element matching ' + target };
        el.click();
        return { ok: true };
      })()`
    case 'fill':
      return `(() => {
        const el = document.querySelector(${JSON.stringify(step.selector)});
        if (!el) return { ok: false, detail: 'no element matching ${step.selector}' };
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
        if (setter) setter.call(el, ${JSON.stringify(step.value)}); else el.value = ${JSON.stringify(step.value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()`
    case 'expect':
      return `(() => {
        const wanted = ${JSON.stringify(step.text)}.toLowerCase();
        const ok = (document.body.innerText || '').toLowerCase().includes(wanted);
        return ok ? { ok: true } : { ok: false, detail: 'page does not show: ' + ${JSON.stringify(step.text)} };
      })()`
    case 'press':
      return `(() => {
        const key = ${JSON.stringify(step.key)};
        const el = document.activeElement || document.body;
        for (const type of ['keydown', 'keypress', 'keyup']) {
          el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
        }
        return { ok: true };
      })()`
    case 'hover':
      return `(() => {
        const target = ${JSON.stringify(step.target)};
        let el = null;
        try { el = document.querySelector(target); } catch {}
        if (!el) {
          const all = [...document.querySelectorAll('*')];
          el = all.find((e) => e.children.length === 0 && (e.textContent || '').trim().toLowerCase().includes(target.toLowerCase()));
        }
        if (!el) return { ok: false, detail: 'no element matching ' + target };
        for (const type of ['pointerover', 'mouseover', 'mouseenter']) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter' }));
        }
        return { ok: true };
      })()`
    case 'scroll':
      return `(() => {
        const target = ${JSON.stringify(step.target)};
        if (target === 'bottom') { window.scrollTo(0, document.body.scrollHeight); return { ok: true }; }
        if (target === 'top') { window.scrollTo(0, 0); return { ok: true }; }
        let el = null;
        try { el = document.querySelector(target); } catch {}
        if (!el) return { ok: false, detail: 'no element matching ' + target };
        el.scrollIntoView({ block: 'center' });
        return { ok: true };
      })()`
    case 'goto':
    case 'shot':
    case 'wait':
      return null // handled by the runner, not in-page
  }
}

/**
 * Flow suggestion (the Playwright-planner move, deterministic): visit
 * each declared route, read its real heading, and draft a smoke flow —
 * goto, expect the heading, screenshot. The engine refines from there;
 * squint never guesses at selectors it hasn't seen.
 */
export async function suggestFlows(
  cwd: string,
  baseUrl: string,
  chromePath: string,
): Promise<{ created: string[]; skipped: string[] }> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { cdpCapture } = await import('./cdp.js')
  const { loadRoutes } = await import('./preview.js')

  const dir = path.join(cwd, '.squint', 'flows')
  fs.mkdirSync(dir, { recursive: true })
  const created: string[] = []
  const skipped: string[] = []

  for (const route of loadRoutes(cwd)) {
    const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const file = path.join(dir, `${slug}.flow`)
    if (fs.existsSync(file)) {
      skipped.push(slug)
      continue
    }
    const url = new URL(route, baseUrl).toString()
    const shotDir = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'squint-suggest-'))
    let heading: string | null = null
    try {
      const capture = await cdpCapture(chromePath, url, shotDir, [], 1200, true)
      const match = capture.narration.map((n) => /^heading \d: "(.+)"$/.exec(n)).find(Boolean)
      heading = match?.[1] ?? null
    } catch {
      // unreachable routes still get a bare flow
    } finally {
      fs.rmSync(shotDir, { recursive: true, force: true })
    }
    const lines = [`goto ${route}`]
    if (heading) lines.push(`expect ${heading}`)
    lines.push(`shot ${slug}`)
    fs.writeFileSync(file, `${lines.join('\n')}\n`)
    created.push(slug)
  }
  return { created, skipped }
}
