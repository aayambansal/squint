import readline from 'node:readline'
import type { Command } from 'commander'
import pc from 'picocolors'
import { defaultPaths, loadConfig, resolveEngineId, resolveModel } from '../config/config.js'
import { connectDaemon } from '../daemon/client.js'
import { socketPath, startDaemon } from '../daemon/server.js'

interface StateShape {
  items?: { role: string; text: string }[]
  running?: boolean
}

/** `squint serve` owns the session; `squint attach` joins it from any terminal. */
export function registerDaemon(program: Command): void {
  program
    .command('serve')
    .description('run the session as a detachable daemon on .squint/daemon.sock')
    .option('-e, --engine <id>', 'engine to drive')
    .option('-m, --model <model>', 'model override')
    .action(async (opts: { engine?: string; model?: string }) => {
      const cwd = process.cwd()
      const config = loadConfig(defaultPaths(cwd))
      const engineId = opts.engine ?? resolveEngineId(config)
      const daemon = await startDaemon({
        cwd,
        engineId,
        model: opts.model ?? resolveModel(config, engineId),
        autoDev: config.autoDev,
        autoFix: config.autoFix,
        autoProbe: config.autoProbe,
        autoCheck: config.autoCheck,
        autoReview: config.autoReview,
        fixModel: config.fixModel,
        budgetUsd: config.budgetUsd,
        approvalWebhook: config.approvalWebhook,
        onQuit: () => {
          daemon.close()
          process.exit(0)
        },
      })
      console.log(`squint daemon on ${socketPath(cwd)} (engine: ${engineId})`)
      console.log('attach from another terminal with: squint attach')
      if (daemon.relayUrl) console.log(`approval relay on ${daemon.relayUrl} → ${config.approvalWebhook}`)
      const stop = () => {
        daemon.close()
        process.exit(0)
      }
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
    })

  program
    .command('mcp')
    .description('serve the gates as MCP tools over stdio (check, shot, flows, context)')
    .action(async () => {
      const { runMcpServer } = await import('../mcp/server.js')
      runMcpServer(process.cwd())
    })

  program
    .command('attach')
    .description('attach this terminal to a running squint daemon (full TUI; --plain for line mode)')
    .option('--plain', 'line-mode attach instead of the full TUI')
    .action(async (opts: { plain?: boolean }) => {
      const cwd = process.cwd()
      if (!opts.plain) {
        try {
          const { RemoteSession } = await import('../daemon/remote.js')
          const remote = await RemoteSession.connect(cwd)
          const config = loadConfig(defaultPaths(cwd))
          const { render } = await import('ink')
          const { App } = await import('../tui/App.js')
          const React = await import('react')
          render(
            React.createElement(App, {
              cwd,
              attachTo: remote,
              initialEngine: remote.getState().engineId,
              bell: config.bell,
              initialTheme: config.theme,
            }),
          )
        } catch {
          console.error(`no daemon at ${socketPath(cwd)} — start one with: squint serve`)
          process.exitCode = 1
        }
        return
      }
      let client
      try {
        client = await connectDaemon(socketPath(cwd))
      } catch {
        console.error(`no daemon at ${socketPath(cwd)} — start one with: squint serve`)
        process.exitCode = 1
        return
      }
      let seen = 0
      let role = 'observer'
      client.onMessage((msg) => {
        if (msg.type === 'hello') {
          role = String(msg.role)
          console.log(pc.dim(`attached as ${role} (engine: ${msg.engineId})`))
          if (role === 'observer') console.log(pc.dim('read-only until the driver detaches'))
          return
        }
        if (msg.type === 'denied') {
          console.log(pc.yellow(`✗ ${msg.reason}`))
          return
        }
        if (msg.type !== 'state') return
        const state = msg.state as StateShape
        const items = state.items ?? []
        // Items are cumulative; print only what this terminal hasn't seen.
        const fresh = seen === 0 ? items.slice(-20) : items.slice(seen)
        seen = items.length
        for (const item of fresh) {
          const line =
            item.role === 'user'
              ? pc.cyan(`> ${item.text}`)
              : item.role === 'error'
                ? pc.red(item.text)
                : item.role === 'status'
                  ? pc.dim(item.text)
                  : item.text
          if (item.role !== 'image') console.log(line)
        }
      })

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.on('line', (line) => {
        const text = line.trim()
        if (!text) return
        if (text === '/detach') {
          client.close()
          rl.close()
          return
        }
        client.send(text.startsWith('/') ? { type: 'command', text } : { type: 'input', text })
      })
      rl.on('close', () => {
        client.close()
        process.exit(0)
      })
    })
}
