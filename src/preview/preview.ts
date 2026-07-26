import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureSquintIgnore } from '../state/state.js'
import { cdpCapture, hasWebSocket, type RuntimeReport } from './cdp.js'
import { loadChecks } from './checks.js'
import { findChrome, screenshot } from './chrome.js'

/** The review viewports: the standard trio from design-review practice. */
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

export interface CaptureResult {
  shots: { name: string; path: string }[]
  errors: string[]
  /** Runtime observations — present when the CDP path was available. */
  runtime?: RuntimeReport
  /** Accessibility sweep findings — present when the CDP path was available. */
  a11y?: string[]
  /** Distinctiveness-debt findings (the checkable AI-slop tells). */
  slop?: string[]
  /** Linearized accessibility-tree narration. */
  narration?: string[]
  /** DOM class tokens with no matching CSS rule — silently unstyled. */
  phantoms?: string[]
  viewTransitions?: string[]
  components?: string[]
  checkFailures?: string[]
  webmcp?: string[]
  jank?: string[]
}

/**
 * Routes to review beyond the root: .squint/routes, one path per line
 * (# comments). The root is always included and always first.
 */
export function loadRoutes(cwd: string): string[] {
  let lines: string[] = []
  try {
    lines = fs
      .readFileSync(path.join(cwd, '.squint', 'routes'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
  } catch {
    // no routes file — root only
  }
  const routes = ['/', ...lines.filter((l) => l !== '/')]
  return routes.slice(0, 6).map((r) => (r.startsWith('/') ? r : `/${r}`))
}

/** File-safe shot name for a route: "/" → root, "/pricing/plans" → pricing-plans. */
export function routeShotName(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
  return clean.length > 0 ? clean : 'root'
}

/** Screenshot dir lives under .squint/ and stays out of git. */
export function previewDir(cwd: string): string {
  const dir = path.join(cwd, '.squint', 'preview')
  fs.mkdirSync(dir, { recursive: true })
  ensureSquintIgnore(cwd)
  return dir
}

/**
 * Capture the app at all review viewports. Preferred path: one CDP
 * session that also watches the runtime (console, exceptions, network).
 * Fallback: Chrome's one-shot screenshot mode. Missing Chrome → null.
 */
export async function captureViewports(cwd: string, url: string): Promise<CaptureResult | null> {
  const chrome = findChrome()
  if (!chrome) return null
  const dir = previewDir(cwd)
  const routes = loadRoutes(cwd)
  const base = url.replace(/\/+$/, '')

  if (hasWebSocket()) {
    try {
      // Root gets the full viewport trio + runtime watch + a11y sweep;
      // additional routes get one desktop shot each.
      const checks = loadChecks(cwd)
      const { report, shots, a11y, slop, narration, phantoms, viewTransitions, components, checkFailures, webmcp, jank } = await cdpCapture(chrome, url, dir, VIEWPORTS, 2500, true, checks)
      const errors: string[] = []
      for (const route of routes.slice(1)) {
        try {
          const routeCapture = await cdpCapture(chrome, `${base}${route}`, dir, [
            { name: routeShotName(route), width: 1440, height: 900 },
          ])
          shots.push(...routeCapture.shots)
          for (const err of routeCapture.report.pageErrors.slice(0, 3)) {
            errors.push(`${route}: ${err.split('\n')[0]}`)
          }
        } catch {
          errors.push(`${route}: capture failed`)
        }
      }
      return { shots, errors, runtime: report, a11y, slop, narration, phantoms, viewTransitions, components, checkFailures, webmcp, jank }
    } catch {
      // fall through to the one-shot path
    }
  }

  const shots: { name: string; path: string }[] = []
  const errors: string[] = []
  for (const viewport of VIEWPORTS) {
    const outPath = path.join(dir, `${viewport.name}.png`)
    const result = await screenshot(chrome, url, outPath, {
      width: viewport.width,
      height: viewport.height,
    })
    if (result.ok) {
      shots.push({ name: viewport.name, path: outPath })
    } else {
      errors.push(`${viewport.name}: ${result.error}`)
    }
  }
  return { shots, errors }
}

export function runtimeSummary(report: RuntimeReport): string | null {
  const parts: string[] = []
  if (report.pageErrors.length > 0) parts.push(`${report.pageErrors.length} page error(s)`)
  if (report.consoleErrors.length > 0) parts.push(`${report.consoleErrors.length} console error(s)`)
  if (report.failedRequests.length > 0) parts.push(`${report.failedRequests.length} failed request(s)`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function runtimeSection(report: RuntimeReport | undefined): string {
  if (!report) return ''
  const blocks: string[] = []
  if (report.pageErrors.length > 0) {
    blocks.push(`Uncaught page errors:\n${report.pageErrors.slice(0, 10).join('\n')}`)
  }
  if (report.consoleErrors.length > 0) {
    blocks.push(`Console errors:\n${report.consoleErrors.slice(0, 10).join('\n')}`)
  }
  if (report.failedRequests.length > 0) {
    blocks.push(`Failed requests:\n${report.failedRequests.slice(0, 10).join('\n')}`)
  }
  if (blocks.length === 0) return ''
  return `\n\n## Runtime errors observed while loading the page\n\n${blocks.join('\n\n')}\n\nFix these first — a page that errors is broken regardless of how it looks.`
}

/**
 * Load the page once and watch the runtime without taking screenshots —
 * the cheap post-turn probe. Null when Chrome/WebSocket are unavailable
 * or the probe itself fails (never blocks the loop).
 */
export interface ProbeResult {
  checkFailures?: string[]
  report: RuntimeReport
  /** Path of the pulse screenshot taken during the probe, when available. */
  pulsePath?: string
  /** Load performance snapshot. */
  perf?: import('./cdp.js').PerfMetrics
}

export async function probeRuntime(url: string, cwd?: string): Promise<ProbeResult | null> {
  const chrome = findChrome()
  if (!chrome || !hasWebSocket()) return null
  try {
    const dir = cwd ? previewDir(cwd) : os.tmpdir()
    const { report, shots, perf, checkFailures } = await cdpCapture(
      chrome,
      url,
      dir,
      cwd ? [{ name: 'pulse', width: 1280, height: 800 }] : [],
      1500,
      false,
      cwd ? loadChecks(cwd, 'turn') : [],
    )
    return { report, pulsePath: shots[0]?.path, perf, checkFailures }
  } catch {
    return null
  }
}

/** Compare two pulse screenshots; null when Chrome or either file is missing. */
export async function comparePulse(previous: Buffer, current: Buffer): Promise<number | null> {
  const chrome = findChrome()
  if (!chrome || !hasWebSocket()) return null
  const { pixelDiffPct } = await import('./cdp.js')
  return pixelDiffPct(chrome, previous, current)
}

/** Attributed compare: percentage plus per-element sentences for the changed regions. */
export async function comparePulseAttributed(
  previous: Buffer,
  current: Buffer,
  url?: string,
): Promise<import('./cdp.js').PulseDiff | null> {
  const chrome = findChrome()
  if (!chrome || !hasWebSocket()) return null
  const { pixelDiffAttributed } = await import('./cdp.js')
  return pixelDiffAttributed(chrome, previous, current, url)
}

/** Fix prompt for runtime errors found without a visual pass. */
export function buildRuntimeFixPrompt(report: RuntimeReport): string {
  return `The running app has runtime problems.${runtimeSection(report)}\n\nDiagnose and fix the root causes, then confirm the app loads clean.`
}

/**
 * The self-critique re-prompt: point the engine at its own rendered work.
 * Engines with vision read the files (Claude Code's Read handles images).
 */
function a11ySection(findings: string[] | undefined): string {
  if (!findings || findings.length === 0) return ''
  return `\n\n## Accessibility sweep findings\n\n${findings.join('\n')}\n\nFix these as part of the pass — they are objective defects, not style preferences.`
}

function narrationSection(narration: string[] | undefined): string {
  if (!narration || narration.length === 0) return ''
  return `\n\n## What a screen reader would say (accessibility tree, in order)\n\n${narration.join('\n')}\n\nJudge this narration as an experience: does the reading order make sense? do names actually describe their targets? is anything announced as "(no accessible name)"? Fix real incoherence — this is how non-visual users meet the page.`
}

function jankSection(jank: string[] | undefined): string {
  if (!jank || jank.length === 0) return ''
  return `\n\n## Jank attribution (main-thread frames ≥50ms)\n\n${jank.join('\n')}\n\nEach line names the function behind a long animation frame observed during load and a scripted scroll. Fix the work (memoize, virtualize, move off the main thread) — do not remove the animation.`
}

function webmcpSection(webmcp: string[] | undefined): string {
  if (!webmcp || webmcp.length === 0) return ''
  return `\n\n## Page-declared WebMCP tools\n\n${webmcp.join('\n')}\n\nThe page registers these for agents via navigator.modelContext — keep them working, and prefer extending them over inventing parallel affordances.`
}

function componentSection(components: string[] | undefined): string {
  if (!components || components.length === 0) return ''
  return `\n\n## Component map (from React fibers)\n\n${components.join('\n')}\n\nUse these owner chains to name the component (and file) an issue lives in instead of describing regions.`
}

function vtSection(viewTransitions: string[] | undefined): string {
  if (!viewTransitions || viewTransitions.length === 0) return ''
  return `\n\n## View-transition findings\n\n${viewTransitions.join('\n')}\n\nDuplicate names abort the whole transition at runtime; missing reduced-motion handling animates for users who opted out. Fix the names / add the media query rather than removing the transitions.`
}

function phantomSection(phantoms: string[] | undefined): string {
  if (!phantoms || phantoms.length === 0) return ''
  return `\n\n## Phantom classes (in the DOM, absent from the CSS)\n\n${phantoms.join('\n')}\n\nEach of these is an element silently unstyled — usually a misspelled or version-mismatched utility (Tailwind v3 spellings in a v4 project) or a concatenated class the scanner never compiled. Fix the class names or define the styles.`
}

function slopSection(findings: string[] | undefined): string {
  if (!findings || findings.length === 0) return ''
  return `\n\n## Distinctiveness debt (detected mechanically)\n\n${findings.join('\n')}\n\nThese patterns make the page read as template output. Rework them within the committed design direction — this is style debt, not a defect list.`
}

export function buildReviewPrompt(
  shots: { name: string; path: string }[],
  extra?: string,
  runtime?: RuntimeReport,
  a11y?: string[],
  slop?: string[],
  narration?: string[],
  phantoms?: string[],
  viewTransitions?: string[],
  components?: string[],
  webmcp?: string[],
  jank?: string[],
): string {
  const list = shots.map((s) => `- ${s.name}: ${s.path}`).join('\n')
  return `Screenshots of the running app were just captured:

${list}

Read each screenshot and review the rendered UI against the design standards you were given. Check: visual hierarchy and spacing rhythm, typography, color and contrast, alignment, empty-looking or broken regions, and whether the mobile capture shows horizontal overflow or cramped layout. List the concrete issues you can SEE (not hypothetical ones), ranked by visual impact${extra ? `, with special attention to: ${extra}` : ''}. Then fix them and verify the app still builds.${runtimeSection(runtime)}${a11ySection(a11y)}${slopSection(slop)}${narrationSection(narration)}${phantomSection(phantoms)}${vtSection(viewTransitions)}${componentSection(components)}${webmcpSection(webmcp)}${jankSection(jank)}`
}
