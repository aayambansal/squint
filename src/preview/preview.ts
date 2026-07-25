import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureSquintIgnore } from '../state/state.js'
import { cdpCapture, hasWebSocket, type RuntimeReport } from './cdp.js'
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

  if (hasWebSocket()) {
    try {
      const { report, shots } = await cdpCapture(chrome, url, dir, VIEWPORTS)
      return { shots, errors: [], runtime: report }
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
export async function probeRuntime(url: string): Promise<RuntimeReport | null> {
  const chrome = findChrome()
  if (!chrome || !hasWebSocket()) return null
  try {
    const { report } = await cdpCapture(chrome, url, os.tmpdir(), [], 1500)
    return report
  } catch {
    return null
  }
}

/** Fix prompt for runtime errors found without a visual pass. */
export function buildRuntimeFixPrompt(report: RuntimeReport): string {
  return `The running app has runtime problems.${runtimeSection(report)}\n\nDiagnose and fix the root causes, then confirm the app loads clean.`
}

/**
 * The self-critique re-prompt: point the engine at its own rendered work.
 * Engines with vision read the files (Claude Code's Read handles images).
 */
export function buildReviewPrompt(
  shots: { name: string; path: string }[],
  extra?: string,
  runtime?: RuntimeReport,
): string {
  const list = shots.map((s) => `- ${s.name}: ${s.path}`).join('\n')
  return `Screenshots of the running app were just captured:

${list}

Read each screenshot and review the rendered UI against the design standards you were given. Check: visual hierarchy and spacing rhythm, typography, color and contrast, alignment, empty-looking or broken regions, and whether the mobile capture shows horizontal overflow or cramped layout. List the concrete issues you can SEE (not hypothetical ones), ranked by visual impact${extra ? `, with special attention to: ${extra}` : ''}. Then fix them and verify the app still builds.${runtimeSection(runtime)}`
}
