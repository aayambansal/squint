import type { Command } from 'commander'
import pc from 'picocolors'
import { defaultPaths, loadConfig, resolveEngineId, resolveModel } from '../config/config.js'
import { getEngine } from '../engines/registry.js'
import type { AgentEvent, RunMode } from '../engines/types.js'
import { composePrompt } from '../prompt/brief.js'
import { runAgent } from '../runner/run.js'

/** Stateful printer: streams deltas live, skips the duplicate final block. */
export function createPrinter(): (event: AgentEvent) => void {
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

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run one prompt headlessly and stream the result')
    .argument('<prompt...>', 'what to build or change')
    .option('-e, --engine <id>', 'engine to use (see squint engines)')
    .option('-m, --model <name>', 'model override for the engine')
    .option('--mode <mode>', 'plan (read-only) · safe (default) · yolo (no friction)')
    .option('--no-brief', 'send the prompt without the squint design brief')
    .option('--json', 'emit normalized agent events as ndjson')
    .action(
      async (
        promptWords: string[],
        options: { engine?: string; model?: string; mode?: string; brief: boolean; json?: boolean },
      ) => {
        const cwd = process.cwd()
        if (options.mode && !['plan', 'safe', 'yolo'].includes(options.mode)) {
          console.error(pc.red('✗ --mode must be plan, safe, or yolo'))
          process.exitCode = 1
          return
        }
        const mode = options.mode as RunMode | undefined
        const config = loadConfig(defaultPaths(cwd))
        const engineId = resolveEngineId(config, options.engine)
        const engine = getEngine(engineId)
        const model = resolveModel(config, engineId, options.model)
        const ask = promptWords.join(' ')
        const prompt = composePrompt(ask, { cwd, noBrief: !options.brief })

        const onEvent = options.json
          ? (event: AgentEvent) => {
              if (event.type !== 'delta') console.log(JSON.stringify(event))
            }
          : createPrinter()
        if (!options.json)
          console.log(
            pc.dim(`squint · ${engine.id}${model ? ` · ${model}` : ''}${mode && mode !== 'safe' ? ` · ${mode}` : ''}`),
          )
        const result = await runAgent(engine, { prompt, cwd, model, mode }, onEvent)
        if (options.json) {
          console.log(JSON.stringify({ type: 'summary', ...result }))
        } else if (result.ok) {
          const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
          const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
          console.log(pc.green(`✓ done${secs}${cost}`))
        }
        if (!result.ok) process.exitCode = 1
      },
    )
}
