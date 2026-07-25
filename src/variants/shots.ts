import path from 'node:path'
import { DevServer, detectDevCommand } from '../devserver/devserver.js'
import { findChrome, screenshot } from '../preview/chrome.js'
import type { Variant } from './variants.js'
import { variantsRoot } from './variants.js'

export interface VariantShot {
  familyId: string
  path?: string
  error?: string
}

const URL_TIMEOUT_MS = 45000

function waitForUrl(server: DevServer): Promise<string | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const poll = setInterval(() => {
      if (server.url) {
        clearInterval(poll)
        resolve(server.url)
      } else if (Date.now() - startedAt > URL_TIMEOUT_MS || server.state === 'crashed') {
        clearInterval(poll)
        resolve(null)
      }
    }, 200)
  })
}

/**
 * Sequentially boot each variant's dev server, capture one desktop
 * screenshot for the picker, and shut it down. Sequential on purpose:
 * n dev servers at once fight for CPU and ports.
 */
export async function screenshotVariants(cwd: string, variants: Variant[]): Promise<VariantShot[]> {
  const chrome = findChrome()
  if (!chrome) {
    return variants.map((v) => ({ familyId: v.family.id, error: 'no Chrome found' }))
  }

  const shots: VariantShot[] = []
  for (const variant of variants) {
    const command = detectDevCommand(variant.dir)
    if (!command) {
      shots.push({ familyId: variant.family.id, error: 'no dev script' })
      continue
    }
    const server = new DevServer(variant.dir)
    server.start(command)
    const url = await waitForUrl(server)
    if (!url) {
      server.stop()
      shots.push({ familyId: variant.family.id, error: 'dev server did not announce a URL' })
      continue
    }
    const outPath = path.join(variantsRoot(cwd), `${variant.family.id}.png`)
    const result = await screenshot(chrome, url, outPath, { width: 1440, height: 900 })
    server.stop()
    shots.push(
      result.ok
        ? { familyId: variant.family.id, path: outPath }
        : { familyId: variant.family.id, error: result.error },
    )
  }
  return shots
}
