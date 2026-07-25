import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { findBinary } from '../engines/registry.js'

/** Well-known Chrome/Chromium locations, most specific first. */
const MAC_CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
]

const PATH_CHROMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

export function findChrome(): string | null {
  if (process.platform === 'darwin') {
    for (const candidate of MAC_CHROMES) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      } catch {
        // keep looking
      }
    }
  }
  for (const name of PATH_CHROMES) {
    const found = findBinary(name)
    if (found) return found
  }
  return null
}

export interface ScreenshotOptions {
  width: number
  height: number
  /** Extra virtual time (ms) for JS/animations to settle. */
  settleMs?: number
  timeoutMs?: number
}

/**
 * One-shot headless screenshot — Chrome's own CLI mode, no automation
 * dependency. `--virtual-time-budget` lets the page's JS run to
 * completion before capture.
 */
export function screenshot(
  chromePath: string,
  url: string,
  outPath: string,
  opts: ScreenshotOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${opts.width},${opts.height}`,
      `--virtual-time-budget=${opts.settleMs ?? 4000}`,
      `--screenshot=${outPath}`,
      url,
    ]
    const child = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, error: 'screenshot timed out' })
    }, opts.timeoutMs ?? 20000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: err.message })
    })
    child.on('close', () => {
      clearTimeout(timer)
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        resolve({ ok: true })
      } else {
        resolve({ ok: false, error: stderr.trim().split('\n').slice(-2).join(' ') || 'no image produced' })
      }
    })
  })
}
