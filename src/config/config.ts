import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'

const ConfigSchema = z.object({
  /** Default engine id (claude, codex, gemini, opencode, amp, cursor, copilot, aider). */
  engine: z.string().optional(),
  /** Per-engine model overrides, e.g. { claude: "claude-sonnet-5" }. */
  models: z.record(z.string(), z.string()).optional(),
  /** Start the project's dev server automatically when the TUI opens. */
  autoDev: z.boolean().optional(),
  /** Automatically send dev-server errors back to the engine (max 2 attempts). */
  autoFix: z.boolean().optional(),
  /** Probe the running app's runtime after each clean turn (default on). */
  autoProbe: z.boolean().optional(),
  /** Run typecheck+lint after every turn (default on where detected). */
  autoCheck: z.boolean().optional(),
  /** Terminal bell when a turn finishes (default on). */
  bell: z.boolean().optional(),
  /** Session budget in USD; crossing it warns (never blocks). */
  budgetUsd: z.number().positive().optional(),
  /** Auto-run /review when the visual pulse shows a big change (default off). */
  autoReview: z.boolean().optional(),
  /** Cheaper model used for auto-fix and /fix turns (mechanical work). */
  fixModel: z.string().optional(),
  /** TUI theme name (amber, ocean, moss, rose, mono). */
  theme: z.string().optional(),
})

export type SquintConfig = z.infer<typeof ConfigSchema>

export interface ConfigPaths {
  globalFile: string
  projectFile: string
}

export function defaultPaths(cwd: string): ConfigPaths {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
  return {
    globalFile: path.join(base, 'squint', 'config.json'),
    projectFile: path.join(cwd, '.squint', 'config.json'),
  }
}

function readConfigFile(file: string): SquintConfig {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  try {
    return ConfigSchema.parse(JSON.parse(raw))
  } catch (err) {
    throw new Error(`Invalid config at ${file}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Project config wins over global; `models` maps merge key-by-key. */
export function loadConfig(paths: ConfigPaths): SquintConfig {
  const global = readConfigFile(paths.globalFile)
  const project = readConfigFile(paths.projectFile)
  return {
    ...global,
    ...project,
    models: { ...global.models, ...project.models },
  }
}

export function resolveEngineId(config: SquintConfig, override?: string): string {
  return override ?? config.engine ?? 'claude'
}

export function resolveModel(config: SquintConfig, engineId: string, override?: string): string | undefined {
  return override ?? config.models?.[engineId]
}

/**
 * Set a config value by key. Supported keys: `engine`, `models.<engineId>`.
 * Writes to the global file unless `file` points elsewhere.
 */
export function setConfigValue(file: string, key: string, value: string): SquintConfig {
  const current = readConfigFile(file)
  let next: SquintConfig
  if (key === 'engine' || key === 'theme' || key === 'fixModel') {
    next = { ...current, [key]: value }
  } else if (
    key === 'autoDev' ||
    key === 'autoFix' ||
    key === 'autoProbe' ||
    key === 'autoCheck' ||
    key === 'autoReview' ||
    key === 'bell'
  ) {
    if (value !== 'true' && value !== 'false') {
      throw new Error(`"${key}" must be true or false`)
    }
    next = { ...current, [key]: value === 'true' }
  } else if (key === 'budgetUsd') {
    const budget = Number.parseFloat(value)
    if (!Number.isFinite(budget) || budget <= 0) {
      throw new Error('"budgetUsd" must be a positive number')
    }
    next = { ...current, budgetUsd: budget }
  } else if (key.startsWith('models.')) {
    const engineId = key.slice('models.'.length)
    if (!engineId) throw new Error('Usage: squint config set models.<engineId> <model>')
    next = { ...current, models: { ...current.models, [engineId]: value } }
  } else {
    throw new Error(
      `Unknown config key "${key}". Supported: engine, theme, autoDev, autoFix, autoProbe, autoCheck, autoReview, bell, budgetUsd, fixModel, models.<engineId>`,
    )
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
  return next
}
