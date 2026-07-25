import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig, resolveEngineId, resolveModel, setConfigValue } from '../src/config/config.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

describe('loadConfig', () => {
  it('returns empty config when no files exist', () => {
    const config = loadConfig({
      globalFile: path.join(dir, 'global.json'),
      projectFile: path.join(dir, 'project.json'),
    })
    expect(resolveEngineId(config)).toBe('claude')
  })

  it('lets project config win over global, merging models per key', () => {
    const globalFile = path.join(dir, 'global.json')
    const projectFile = path.join(dir, 'project.json')
    write(globalFile, { engine: 'claude', models: { claude: 'claude-opus-5', codex: 'gpt-5' } })
    write(projectFile, { engine: 'codex', models: { claude: 'claude-sonnet-5' } })

    const config = loadConfig({ globalFile, projectFile })
    expect(config.engine).toBe('codex')
    expect(config.models).toEqual({ claude: 'claude-sonnet-5', codex: 'gpt-5' })
  })

  it('throws a pointed error for invalid config', () => {
    const globalFile = path.join(dir, 'global.json')
    fs.writeFileSync(globalFile, '{not json')
    expect(() =>
      loadConfig({ globalFile, projectFile: path.join(dir, 'project.json') }),
    ).toThrow(/Invalid config/)
  })
})

describe('resolveModel', () => {
  it('prefers explicit override, then config, then undefined', () => {
    const config = { models: { claude: 'claude-sonnet-5' } }
    expect(resolveModel(config, 'claude', 'claude-opus-5')).toBe('claude-opus-5')
    expect(resolveModel(config, 'claude')).toBe('claude-sonnet-5')
    expect(resolveModel(config, 'codex')).toBeUndefined()
  })
})

describe('setConfigValue', () => {
  it('sets engine and per-engine models via dot path', () => {
    const file = path.join(dir, 'nested', 'config.json')
    setConfigValue(file, 'engine', 'codex')
    setConfigValue(file, 'models.claude', 'claude-sonnet-5')
    const config = loadConfig({ globalFile: file, projectFile: path.join(dir, 'none.json') })
    expect(config.engine).toBe('codex')
    expect(config.models?.claude).toBe('claude-sonnet-5')
  })

  it('parses loop toggles as booleans and rejects junk values', () => {
    const file = path.join(dir, 'c.json')
    setConfigValue(file, 'autoFix', 'true')
    setConfigValue(file, 'autoProbe', 'false')
    const config = loadConfig({ globalFile: file, projectFile: path.join(dir, 'none.json') })
    expect(config.autoFix).toBe(true)
    expect(config.autoProbe).toBe(false)
    expect(() => setConfigValue(file, 'autoDev', 'yes')).toThrow(/must be true or false/)
  })

  it('rejects unknown keys', () => {
    expect(() => setConfigValue(path.join(dir, 'c.json'), 'nope', 'x')).toThrow(/Unknown config key/)
  })
})
