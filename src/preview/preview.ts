import fs from 'node:fs'
import path from 'node:path'
import { ensureSquintIgnore } from '../state/state.js'
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
}

/** Screenshot dir lives under .squint/ and stays out of git. */
export function previewDir(cwd: string): string {
  const dir = path.join(cwd, '.squint', 'preview')
  fs.mkdirSync(dir, { recursive: true })
  ensureSquintIgnore(cwd)
  return dir
}

/** Capture the app at all review viewports. Missing Chrome → soft failure. */
export async function captureViewports(cwd: string, url: string): Promise<CaptureResult | null> {
  const chrome = findChrome()
  if (!chrome) return null

  const dir = previewDir(cwd)
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

/**
 * The self-critique re-prompt: point the engine at its own rendered work.
 * Engines with vision read the files (Claude Code's Read handles images).
 */
export function buildReviewPrompt(shots: { name: string; path: string }[], extra?: string): string {
  const list = shots.map((s) => `- ${s.name}: ${s.path}`).join('\n')
  return `Screenshots of the running app were just captured:

${list}

Read each screenshot and review the rendered UI against the design standards you were given. Check: visual hierarchy and spacing rhythm, typography, color and contrast, alignment, empty-looking or broken regions, and whether the mobile capture shows horizontal overflow or cramped layout. List the concrete issues you can SEE (not hypothetical ones), ranked by visual impact${extra ? `, with special attention to: ${extra}` : ''}. Then fix them and verify the app still builds.`
}
