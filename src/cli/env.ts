import type { Command } from 'commander'
import pc from 'picocolors'
import { detectEngines } from '../engines/registry.js'

export function registerEnv(program: Command): void {
  program
    .command('engines')
    .description('List engines: installed, streaming, session resume')
    .action(() => {
      console.log(pc.dim('   id         name           stream  resume  where'))
      for (const { engine, path: binaryPath } of detectEngines()) {
        const status = binaryPath ? pc.green('✓') : pc.red('✗')
        const stream = engine.createParser ? pc.green('yes') : pc.dim('text')
        const resume = engine.supportsResume ? pc.green('yes') : pc.dim('no')
        const location = binaryPath ?? pc.dim(`not found — ${engine.install}`)
        console.log(
          `${status} ${engine.id.padEnd(10)} ${engine.name.padEnd(14)} ${stream.padEnd(15)} ${resume.padEnd(14)} ${location}`,
        )
      }
      console.log(pc.dim('\nplan/safe/yolo modes map onto every engine · squint doctor --probe verifies auth'))
    })

  program
    .command('doctor')
    .description('Check squint prerequisites and engine availability')
    .option('--probe', 'run each detected engine with a one-word prompt to verify auth works')
    .action(async (options: { probe?: boolean }) => {
      const [major] = process.versions.node.split('.')
      const nodeOk = Number(major) >= 22
      console.log(
        `${nodeOk ? pc.green('✓') : pc.red('✗')} node ${process.versions.node}${nodeOk ? '' : ' (need >= 22)'}`,
      )

      const detected = detectEngines()
      for (const { engine, path: binaryPath } of detected) {
        const status = binaryPath ? pc.green('✓') : pc.yellow('○')
        console.log(`${status} ${engine.name}${binaryPath ? '' : pc.dim(` — install: ${engine.install}`)}`)
      }

      if (options.probe) {
        const { runAgent } = await import('../runner/run.js')
        console.log(pc.dim('\nprobing engines with a one-word prompt (verifies auth end to end)…'))
        for (const { engine, path: binaryPath } of detected) {
          if (!binaryPath) continue
          const startedAt = Date.now()
          const abort = new AbortController()
          const timer = setTimeout(() => abort.abort(), 90000)
          // Probe the default (safe) invocation — the exact path a real ask takes.
          const result = await runAgent(
            engine,
            { prompt: 'Reply with exactly: ok', cwd: process.cwd() },
            () => {},
            abort.signal,
          )
          clearTimeout(timer)
          const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
          // The last error line is usually the actionable one ("run agent login").
          const detail = (result.error ?? 'failed').split('\n').filter((l) => l.trim()).at(-1) ?? 'failed'
          console.log(
            result.ok
              ? `${pc.green('✓')} ${engine.id.padEnd(10)} responded in ${secs}s`
              : `${pc.red('✗')} ${engine.id.padEnd(10)} ${pc.dim(detail.slice(0, 110))}`,
          )
        }
      }

      const { findChrome } = await import('../preview/chrome.js')
      const { hasWebSocket } = await import('../preview/cdp.js')
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
}
