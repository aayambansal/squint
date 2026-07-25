import { describe, expect, it } from 'vitest'
import { commandHelp, COMMANDS, completeCommand } from '../src/session/commands.js'

describe('command registry', () => {
  it('has unique names and descriptions for every command', () => {
    const names = COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const command of COMMANDS) {
      expect(command.description.length).toBeGreaterThan(8)
    }
  })

  it('completes by prefix, empty prefix lists all', () => {
    expect(completeCommand('ch').map((c) => c.name)).toEqual(['check', 'checkpoints'])
    expect(completeCommand('re').map((c) => c.name)).toEqual(['review', 'restore', 'resume'])
    expect(completeCommand('zzz')).toEqual([])
    expect(completeCommand('').length).toBe(COMMANDS.length)
  })

  it('renders grouped help from the same registry', () => {
    const help = commandHelp()
    expect(help).toContain('/variants <2-4> <ask> —')
    expect(help).toContain('build\n')
    expect(help).toContain('verify\n')
    expect(help).toContain('explore & rewind\n')
    expect(help).toContain('session\n')
    // Every command appears exactly once.
    for (const command of COMMANDS) {
      expect(help.split(`/${command.name} `).length + help.split(`/${command.name} —`).length).toBeGreaterThan(1)
    }
    expect(help.split('\n').length).toBe(COMMANDS.length + 4)
  })
})
