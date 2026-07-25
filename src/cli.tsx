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

const VERSION = '0.1.3'

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
  .option('--json', 'emit normalized agent events as ndjson')
  .action(
    async (promptWords: string[], options: { engine?: string; model?: string; brief: boolean; json?: boolean }) => {
      const cwd = process.cwd()
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
      if (!options.json) console.log(pc.dim(`squint · ${engine.id}${model ? ` · ${model}` : ''}`))
      const result = await runAgent(engine, { prompt, cwd, model }, onEvent)
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
  .action(async () => {
    const [major] = process.versions.node.split('.')
    const nodeOk = Number(major) >= 20
    console.log(`${nodeOk ? pc.green('✓') : pc.red('✗')} node ${process.versions.node}${nodeOk ? '' : ' (need >= 20)'}`)

    const detected = detectEngines()
    for (const { engine, path: binaryPath } of detected) {
      const status = binaryPath ? pc.green('✓') : pc.yellow('○')
      console.log(`${status} ${engine.name}${binaryPath ? '' : pc.dim(` — install: ${engine.install}`)}`)
    }

    const { findChrome } = await import('./preview/chrome.js')
    const { hasWebSocket } = await import('./preview/cdp.js')
    const chrome = findChrome()
    console.log(
      chrome
        ? `${pc.green('✓')} Chrome ${pc.dim(chrome)}`
        : `${pc.yellow('○')} Chrome ${pc.dim('— screenshots and runtime probing disabled')}`,
    )
    console.log(
      hasWebSocket()
        ? `${pc.green('✓')} WebSocket ${pc.dim('runtime console/network capture available')}`
        : `${pc.yellow('○')} WebSocket ${pc.dim('— node 22+ enables runtime capture; screenshots still work')}`,
    )

    const available = detected.filter((d) => d.path !== null)
    if (available.length === 0) {
      console.log(pc.red('\nNo engines found. Install at least one to use squint.'))
      process.exitCode = 1
    } else {
      console.log(pc.dim(`\n${available.length} engine(s) ready.`))
    }
  })

program
  .command('init')
  .description('Scaffold a new Vite + React + TS + Tailwind app with token-first CSS')
  .argument('[dir]', 'target directory', '.')
  .option('--force', 'write into a non-empty directory')
  .option('--no-install', 'skip npm install')
  .action(async (dir: string, options: { force?: boolean; install: boolean }) => {
    const { installDependencies, writeTemplate } = await import('./scaffold/init.js')
    let result
    try {
      result = writeTemplate(dir, { force: options.force })
    } catch (err) {
      console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`))
      process.exitCode = 1
      return
    }
    console.log(pc.green(`✓ scaffolded ${result.files.length} files in ${result.dir}`))
    if (options.install) {
      console.log(pc.dim('installing dependencies…'))
      const ok = await installDependencies(result.dir)
      if (!ok) {
        console.error(pc.red('✗ npm install failed — run it manually'))
        process.exitCode = 1
        return
      }
    }
    const cd = result.dir === '.' ? '' : `cd ${result.dir} && `
    console.log(`\nNext: ${pc.bold(`${cd}${options.install ? '' : 'npm install && '}squint`)}`)
    console.log(pc.dim('then describe what to build — /dev starts the preview server'))
  })

program
  .command('tag')
  .description('Add the element picker to this Vite app (Alt+S in the browser → click → file:line:col)')
  .action(async () => {
    const fs = await import('node:fs')
    const nodePath = await import('node:path')
    const { patchViteConfig, TAGGER_FILENAME, TAGGER_SOURCE } = await import('./tagger/source.js')
    const cwd = process.cwd()
    const taggerPath = nodePath.join(cwd, TAGGER_FILENAME)
    fs.writeFileSync(taggerPath, TAGGER_SOURCE)
    console.log(pc.green(`✓ ${TAGGER_FILENAME} written`))

    const configPath = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
      .map((name) => nodePath.join(cwd, name))
      .find((candidate) => fs.existsSync(candidate))
    if (!configPath) {
      console.log(pc.yellow('○ no vite config found — add the plugin manually:'))
      console.log(pc.dim(`  import squintTagger from './${TAGGER_FILENAME}'\n  plugins: [squintTagger(), …]`))
      return
    }
    const source = fs.readFileSync(configPath, 'utf8')
    const patched = patchViteConfig(source)
    if (patched === 'already') {
      console.log(pc.dim('vite config already wired'))
    } else if (patched === null) {
      console.log(pc.yellow(`○ could not patch ${nodePath.basename(configPath)} automatically — add:`))
      console.log(pc.dim(`  import squintTagger from './${TAGGER_FILENAME}'\n  plugins: [squintTagger(), …]`))
    } else {
      fs.writeFileSync(configPath, patched)
      console.log(pc.green(`✓ ${nodePath.basename(configPath)} wired`))
    }
    console.log(pc.dim('\nin the running app: Alt+S → click an element → paste the copied file:line:col into squint'))
  })

const variantsCommand = program
  .command('variants')
  .description('Parallel design explorations — one aesthetic family each, pick with your eyes')

variantsCommand
  .command('gen')
  .description('Generate n variants of one ask in parallel (n engine runs — n× cost)')
  .argument('<n>', 'how many variants (max 4)')
  .argument('<prompt...>', 'what to build')
  .option('-e, --engine <id>', 'engine to use')
  .option('-m, --model <name>', 'model override')
  .option('--no-shots', 'skip the screenshot pass')
  .action(
    async (nRaw: string, promptWords: string[], options: { engine?: string; model?: string; shots: boolean }) => {
      const cwd = process.cwd()
      const n = Number.parseInt(nRaw, 10)
      if (!Number.isInteger(n) || n < 2 || n > 4) {
        console.error(pc.red('✗ n must be 2–4'))
        process.exitCode = 1
        return
      }
      const { isGitRepo } = await import('./vcs/snapshot.js')
      if (!isGitRepo(cwd)) {
        console.error(pc.red('✗ variants need a git repo with at least one commit'))
        process.exitCode = 1
        return
      }
      const { runVariants, cleanVariants } = await import('./variants/variants.js')
      const config = loadConfig(defaultPaths(cwd))
      const engineId = resolveEngineId(config, options.engine)
      const engine = getEngine(engineId)
      const model = resolveModel(config, engineId, options.model)
      const ask = promptWords.join(' ')

      cleanVariants(cwd)
      console.log(pc.dim(`generating ${n} directions in parallel via ${engine.id} — this runs ${n} engine sessions`))
      const runs = await runVariants(cwd, ask, n, engine, model, (familyId, text) =>
        console.log(`${pc.cyan(familyId.padEnd(18))} ${pc.dim(text)}`),
      )

      const succeeded = runs.filter((r) => r.result.ok)
      if (options.shots && succeeded.length > 0) {
        const { screenshotVariants } = await import('./variants/shots.js')
        console.log(pc.dim('capturing screenshots…'))
        const shots = await screenshotVariants(cwd, succeeded.map((r) => r.variant))
        for (const shot of shots) {
          console.log(`${pc.green('✓')} ${shot.familyId.padEnd(18)} ${shot.path ?? pc.dim(shot.error ?? '')}`)
        }
      }
      console.log(
        `\n${succeeded.length}/${runs.length} variants ready in .squint/variants/ — ` +
          pc.bold('squint variants apply <id>') +
          pc.dim(' applies the winner, squint variants clean discards all'),
      )
      if (succeeded.length === 0) process.exitCode = 1
    },
  )

variantsCommand
  .command('list')
  .description('List generated variants')
  .action(async () => {
    const { listVariants } = await import('./variants/variants.js')
    const ids = listVariants(process.cwd())
    if (ids.length === 0) {
      console.log(pc.dim('no variants — squint variants gen <n> "<ask>"'))
      return
    }
    for (const id of ids) console.log(id)
  })

variantsCommand
  .command('apply')
  .description('Apply one variant’s changes to the main tree and discard the rest')
  .argument('<id>', 'family id of the winning variant')
  .action(async (id: string) => {
    const { applyVariant, cleanVariants } = await import('./variants/variants.js')
    const cwd = process.cwd()
    const result = applyVariant(cwd, id)
    if (!result.ok) {
      console.error(pc.red(`✗ ${result.detail}`))
      process.exitCode = 1
      return
    }
    cleanVariants(cwd)
    console.log(pc.green(`✓ applied ${id} to the working tree`) + pc.dim(' — review with git diff'))
  })

variantsCommand
  .command('clean')
  .description('Discard all variants')
  .action(async () => {
    const { cleanVariants } = await import('./variants/variants.js')
    const count = cleanVariants(process.cwd())
    console.log(pc.dim(`removed ${count} variant(s)`))
  })

program
  .command('brief')
  .description('Set a committed design direction for this project (.squint/brief.md)')
  .argument('[family]', 'aesthetic family id (omit to list)')
  .option('--force', 'overwrite an existing project brief')
  .action(async (familyId: string | undefined, options: { force?: boolean }) => {
    const fs = await import('node:fs')
    const nodePath = await import('node:path')
    const { FAMILIES, getFamily, renderFamilyBrief } = await import('./prompt/families.js')
    if (!familyId) {
      console.log(pc.bold('Aesthetic families') + pc.dim(' — squint brief <id>\n'))
      for (const family of FAMILIES) {
        console.log(`${pc.green(family.id.padEnd(18))} ${family.name.padEnd(22)} ${pc.dim(family.summary)}`)
      }
      console.log(pc.dim('\nThe brief wraps every ask; edit .squint/brief.md to remix.'))
      return
    }
    const family = getFamily(familyId)
    if (!family) {
      console.error(pc.red(`✗ unknown family "${familyId}" — run squint brief to list`))
      process.exitCode = 1
      return
    }
    const target = nodePath.join(process.cwd(), '.squint', 'brief.md')
    if (fs.existsSync(target) && !options.force) {
      console.error(pc.red(`✗ ${target} exists — use --force to overwrite`))
      process.exitCode = 1
      return
    }
    fs.mkdirSync(nodePath.dirname(target), { recursive: true })
    fs.writeFileSync(target, renderFamilyBrief(family) + '\n')
    console.log(pc.green(`✓ ${family.name} direction written to .squint/brief.md`))
    console.log(pc.dim('every squint ask in this repo now holds this direction — edit the file to remix'))
  })

program
  .command('check')
  .description('Run this project’s quality gates (typecheck, lint, test, build)')
  .action(async () => {
    const { detectGates, runGates } = await import('./gates/gates.js')
    const cwd = process.cwd()
    const gates = detectGates(cwd)
    if (gates.length === 0) {
      console.log(pc.dim('no gates detected (no package.json scripts, tsconfig, or eslint config)'))
      return
    }
    console.log(pc.dim(`running ${gates.map((g) => g.id).join(' → ')}`))
    const results = await runGates(cwd, gates, (result) => {
      const mark = result.ok ? pc.green('✓') : pc.red('✗')
      console.log(`${mark} ${result.gate.id.padEnd(10)} ${pc.dim(`${(result.durationMs / 1000).toFixed(1)}s · ${result.gate.display}`)}`)
      if (!result.ok) console.log(pc.dim(result.outputTail.split('\n').slice(-12).join('\n')))
    })
    if (results.some((r) => !r.ok)) process.exitCode = 1
  })

program
  .command('shot')
  .description('Screenshot a running app at mobile/tablet/desktop viewports')
  .argument('<url>', 'URL of the running app (e.g. http://localhost:5173)')
  .action(async (url: string) => {
    const { captureViewports } = await import('./preview/preview.js')
    const result = await captureViewports(process.cwd(), url)
    if (!result) {
      console.error(pc.red('✗ no Chrome/Chromium found'))
      process.exitCode = 1
      return
    }
    for (const shot of result.shots) console.log(`${pc.green('✓')} ${shot.name.padEnd(8)} ${shot.path}`)
    for (const error of result.errors) console.error(pc.red(`✗ ${error}`))
    if (result.shots.length === 0) process.exitCode = 1
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
  render(
    <App
      cwd={cwd}
      initialEngine={engineId}
      initialModel={model}
      autoDev={config.autoDev}
      autoFix={config.autoFix}
      autoProbe={config.autoProbe}
    />,
  )
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
