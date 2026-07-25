import { Command } from 'commander'
import { registerConfig } from './cli/configCmd.js'
import { registerEnv } from './cli/env.js'
import { registerProject } from './cli/project.js'
import { registerQuality } from './cli/quality.js'
import { registerRun } from './cli/run.js'
import { registerScaffold } from './cli/scaffold.js'
import { registerTui } from './cli/tui.js'

const VERSION = '0.2.8'

const program = new Command()

program
  .name('squint')
  .description('Lovable for your terminal — a frontend harness on top of Claude Code, Codex, and friends.')
  .version(VERSION)

registerRun(program)
registerEnv(program)
registerScaffold(program)
registerProject(program)
registerQuality(program)
registerConfig(program)
registerTui(program)

program.parseAsync(process.argv)
