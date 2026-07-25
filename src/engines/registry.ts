import fs from 'node:fs'
import path from 'node:path'
import { claude } from './claude.js'
import { codex } from './codex.js'
import { gemini } from './gemini.js'
import { opencode } from './opencode.js'
import type { Engine } from './types.js'

export const engines: Engine[] = [claude, codex, gemini, opencode]

export function getEngine(id: string): Engine {
  const engine = engines.find((e) => e.id === id)
  if (!engine) {
    const known = engines.map((e) => e.id).join(', ')
    throw new Error(`Unknown engine "${id}". Available: ${known}`)
  }
  return engine
}

/** Resolve a binary on PATH; returns the absolute path or null. */
export function findBinary(binary: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter)
  for (const dir of dirs) {
    if (!dir) continue
    const full = path.join(dir, binary)
    try {
      fs.accessSync(full, fs.constants.X_OK)
      return full
    } catch {
      // keep scanning
    }
  }
  return null
}

export interface DetectedEngine {
  engine: Engine
  path: string | null
}

export function detectEngines(): DetectedEngine[] {
  return engines.map((engine) => ({ engine, path: findBinary(engine.binary) }))
}
