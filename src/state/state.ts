import fs from 'node:fs'
import path from 'node:path'

/**
 * Per-project session memory: enough to pick a conversation back up
 * after the TUI closes. Lives in .squint/state.json, out of git.
 */
export interface ProjectState {
  engine: string
  sessionId: string
  model?: string
  /** Truncated last ask, for the resume hint. */
  lastAsk?: string
  /** ms epoch of the last completed turn. */
  at: number
}

const IGNORED = ['preview/', 'state.json', 'variants/', 'transcripts/']

/** Keep .squint/ working files out of the project's git history. */
export function ensureSquintIgnore(cwd: string): void {
  const dir = path.join(cwd, '.squint')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, '.gitignore')
  let existing = ''
  try {
    existing = fs.readFileSync(file, 'utf8')
  } catch {
    // fresh file
  }
  const lines = existing.split('\n').filter((l) => l.trim().length > 0)
  const missing = IGNORED.filter((entry) => !lines.includes(entry))
  if (missing.length > 0) {
    fs.writeFileSync(file, [...lines, ...missing].join('\n') + '\n')
  }
}

function stateFile(cwd: string): string {
  return path.join(cwd, '.squint', 'state.json')
}

export function loadState(cwd: string): ProjectState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(cwd), 'utf8'))
    if (typeof raw?.engine === 'string' && typeof raw?.sessionId === 'string' && typeof raw?.at === 'number') {
      return raw as ProjectState
    }
  } catch {
    // missing or corrupt — treat as no state
  }
  return null
}

export function saveState(cwd: string, state: ProjectState): void {
  ensureSquintIgnore(cwd)
  fs.writeFileSync(stateFile(cwd), JSON.stringify(state, null, 2) + '\n')
}

export function clearState(cwd: string): void {
  try {
    fs.rmSync(stateFile(cwd))
  } catch {
    // already gone
  }
}
