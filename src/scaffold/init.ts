import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { templateFiles } from './template.js'

export interface InitResult {
  dir: string
  files: string[]
}

/**
 * Write the starter into `dir`. Refuses a non-empty directory (dotfiles
 * like .git are tolerated) unless `force` — never trample existing work.
 */
export function writeTemplate(dir: string, opts: { force?: boolean } = {}): InitResult {
  fs.mkdirSync(dir, { recursive: true })
  const existing = fs.readdirSync(dir).filter((entry) => !entry.startsWith('.'))
  if (existing.length > 0 && !opts.force) {
    throw new Error(`${dir} is not empty (${existing.slice(0, 3).join(', ')}…). Use --force to write anyway.`)
  }

  const name = sanitizeName(path.basename(path.resolve(dir)))
  const files = templateFiles(name)
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return { dir, files: Object.keys(files) }
}

function sanitizeName(raw: string): string {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name.length > 0 ? name : 'squint-app'
}

/** Run `npm install` in the scaffolded app, streaming output through. */
export function installDependencies(dir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install'], { cwd: dir, stdio: 'inherit' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}
