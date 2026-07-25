import { Command } from 'commander'
import { render } from 'ink'
import pc from 'picocolors'
import {
  defaultPaths,
  loadConfig,
  resolveEngineId,
  resolveModel,
  setConfigValue,
} from './config/config.js'
import { detectEngines, getEngine } from './engines/registry.js'
import type { AgentEvent } from './engines/types.js'
import { composePrompt } from './prompt/brief.js'
import { runAgent } from './runner/run.js'
import { App } from './tui/App.js'

const VERSION = '0.1.0'

const program = new Command()

program
  .name('squint')
  .description('Lovable for your terminal — a frontend harness on top of Claude Code, Codex, and friends.')
  .version(VERSION)

program
  .command('run')
  .description('Run one prompt headlessly and stream the result')
  .argument('<prompt...>', 'what to build or change')
  .option('-e, --engine <id>', 'engine to use (claude, codex, gemini, opencode)')
  .option('-m, --model <name>', 'model override for the engine')
  .option('--no-brief', 'send the prompt without the squint design brief')
  .action(async (promptWords: string[], options: { engine?: string; model?: string; brief: boolean }) => {
    const cwd = process.cwd()
    const config = loadConfig(defaultPaths(cwd))
    const engineId = resolveEngineId(config, options.engine)
    const engine = getEngine(engineId)
    const model = resolveModel(config, engineId, options.model)
    const ask = promptWords.join(' ')
    const prompt = composePrompt(ask, { cwd, noBrief: !options.brief })

    console.log(pc.dim(`squint · ${engine.id}${model ? ` · ${model}` : ''}`))
    const result = await runAgent(engine, { prompt, cwd, model }, createPrinter())
    if (result.ok) {
      const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
      const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
      console.log(pc.green(`✓ done${secs}${cost}`))
    } else {
      process.exitCode = 1
    }
  })

program
  .command('engines')
  .description('List engines and whether they are installed')
  .action(() => {
    for (const { engine, path: binaryPath } of detectEngines()) {
      const status = binaryPath ? pc.green('✓') : pc.red('✗')
      const location = binaryPath ?? pc.dim(`not found — ${engine.install}`)
      console.log(`${status} ${engine.id.padEnd(10)} ${engine.name.padEnd(14)} ${location}`)
    }
  })

program
  .command('doctor')
  .description('Check squint prerequisites and engine availability')
  .action(() => {
    const [major] = process.versions.node.split('.')
    const nodeOk = Number(major) >= 20
    console.log(`${nodeOk ? pc.green('✓') : pc.red('✗')} node ${process.versions.node}${nodeOk ? '' : ' (need >= 20)'}`)

    const detected = detectEngines()
    for (const { engine, path: binaryPath } of detected) {
      const status = binaryPath ? pc.green('✓') : pc.yellow('○')
      console.log(`${status} ${engine.name}${binaryPath ? '' : pc.dim(` — install: ${engine.install}`)}`)
    }

    const available = detected.filter((d) => d.path !== null)
    if (available.length === 0) {
      console.log(pc.red('\nNo engines found. Install at least one to use squint.'))
      process.exitCode = 1
    } else {
      console.log(pc.dim(`\n${available.length} engine(s) ready.`))
    }
  })

const configCommand = program.command('config').description('Read or change squint configuration')

configCommand
  .command('get')
  .description('Print the resolved configuration')
  .action(() => {
    const paths = defaultPaths(process.cwd())
    console.log(JSON.stringify(loadConfig(paths), null, 2))
  })

configCommand
  .command('set')
  .description('Set a value (keys: engine, models.<engineId>)')
  .argument('<key>')
  .argument('<value>')
  .option('--project', 'write to this project (.squint/config.json) instead of global')
  .action((key: string, value: string, options: { project?: boolean }) => {
    const paths = defaultPaths(process.cwd())
    const file = options.project ? paths.projectFile : paths.globalFile
    setConfigValue(file, key, value)
    console.log(pc.green(`✓ ${key} = ${value}`) + pc.dim(` (${file})`))
  })

configCommand
  .command('path')
  .description('Show config file locations')
  .action(() => {
    const paths = defaultPaths(process.cwd())
    console.log(`global   ${paths.globalFile}`)
    console.log(`project  ${paths.projectFile}`)
  })

// No subcommand → launch the TUI.
program.action(() => {
  const cwd = process.cwd()
  const config = loadConfig(defaultPaths(cwd))
  const engineId = resolveEngineId(config)
  const model = resolveModel(config, engineId)
  render(<App cwd={cwd} initialEngine={engineId} initialModel={model} />)
})

/** Stateful printer: streams deltas live, skips the duplicate final block. */
function createPrinter(): (event: AgentEvent) => void {
  let streaming = false
  return (event) => {
    switch (event.type) {
      case 'status':
        console.log(pc.dim(`· ${event.text}`))
        break
      case 'delta':
        streaming = true
        process.stdout.write(event.text)
        break
      case 'text':
        if (event.streamed && streaming) {
          process.stdout.write('\n')
        } else {
          console.log(event.text)
        }
        streaming = false
        break
      case 'thinking':
        console.log(pc.dim(pc.italic(event.text)))
        break
      case 'tool':
        if (streaming) {
          process.stdout.write('\n')
          streaming = false
        }
        console.log(pc.cyan(`⚙ ${event.name}${event.detail ? ` · ${event.detail}` : ''}`))
        break
      case 'error':
        console.error(pc.red(`✗ ${event.text}`))
        break
      case 'result':
      case 'raw':
        break
    }
  }
}

program.parseAsync(process.argv)
