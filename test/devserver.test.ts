import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildFixPrompt, detectDevCommand, DevServer } from '../src/devserver/devserver.js'
import { extractUrl, isErrorLine } from '../src/devserver/errors.js'

describe('isErrorLine', () => {
  it('recognizes the common build-error vocabularies', () => {
    expect(isErrorLine('src/App.tsx(3,1): error TS2304: Cannot find name')).toBe(true)
    expect(isErrorLine('✘ [ERROR] Could not resolve "./missing"')).toBe(true)
    expect(isErrorLine('[vite] Internal server error: parse failure')).toBe(true)
    expect(isErrorLine('Failed to compile.')).toBe(true)
    expect(isErrorLine('Module not found: ./Widget')).toBe(true)
    expect(isErrorLine('ReferenceError: foo is not defined')).toBe(true)
  })

  it('ignores routine output and all-clear lines', () => {
    expect(isErrorLine('VITE v5.4.0 ready in 320 ms')).toBe(false)
    expect(isErrorLine('Found 0 errors. Watching for file changes.')).toBe(false)
    expect(isErrorLine('hmr update /src/App.tsx')).toBe(false)
    expect(isErrorLine('no errors found')).toBe(false)
  })
})

describe('extractUrl', () => {
  it('pulls local urls out of dev server banners', () => {
    expect(extractUrl('  ➜  Local:   http://localhost:5173/')).toBe('http://localhost:5173/')
    expect(extractUrl('Server running at http://127.0.0.1:3000.')).toBe('http://127.0.0.1:3000')
    expect(extractUrl('compiled successfully')).toBeNull()
  })
})

describe('detectDevCommand', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-dev-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('prefers the dev script and picks the manager from the lockfile', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', start: 'x' } }))
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    expect(detectDevCommand(dir)).toEqual({ command: 'pnpm', args: ['run', 'dev'], display: 'pnpm run dev' })
  })

  it('falls back to start, npm, and yarn syntax', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { start: 'node server' } }))
    expect(detectDevCommand(dir)).toEqual({ command: 'npm', args: ['run', 'start'], display: 'npm run start' })
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '')
    expect(detectDevCommand(dir)?.command).toBe('yarn')
    expect(detectDevCommand(dir)?.args).toEqual(['start'])
  })

  it('returns null without package.json or scripts', () => {
    expect(detectDevCommand(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {} }))
    expect(detectDevCommand(dir)).toBeNull()
  })
})

describe('DevServer', () => {
  it('captures the url, tags errors, and windows them by time', async () => {
    const script =
      "console.log('ready on http://localhost:4111'); " +
      "console.error('error TS2304: Cannot find name qq'); " +
      "setTimeout(() => console.log('bye'), 50)"
    const server = new DevServer(process.cwd())
    const before = Date.now()
    server.start({ command: 'node', args: ['-e', script], display: 'node -e' })

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(server.url).toBe('http://localhost:4111')
    expect(server.state).toBe('crashed') // process exited — treated as crash
    expect(server.errorsSince(before)).toEqual(['error TS2304: Cannot find name qq'])
    expect(server.errorsSince(Date.now() + 1000)).toEqual([])
    expect(server.tail(2).length).toBeGreaterThan(0)
  })
})

describe('buildFixPrompt', () => {
  it('includes errors and recent output with root-cause instruction', () => {
    const prompt = buildFixPrompt(['error TS1005: expected ;'], ['line a', 'line b'])
    expect(prompt).toContain('error TS1005')
    expect(prompt).toContain('line b')
    expect(prompt).toContain('root cause')
  })
})
