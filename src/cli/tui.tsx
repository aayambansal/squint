import type { Command } from 'commander'
import { render } from 'ink'
import { defaultPaths, loadConfig, resolveEngineId, resolveModel } from '../config/config.js'
import { App } from '../tui/App.js'

/** No subcommand → launch the TUI. */
export function registerTui(program: Command): void {
  program.action(async () => {
    const cwd = process.cwd()
    const config = loadConfig(defaultPaths(cwd))
    const engineId = resolveEngineId(config)
    const model = resolveModel(config, engineId)
    // Detect the terminal background before Ink attaches, so the OSC reply
    // never leaks into the input line. User-chosen themes always win.
    let theme = config.theme
    if (!theme && !process.env.NO_COLOR) {
      const { detectBackground } = await import('../tui/background.js')
      if ((await detectBackground()) === 'light') theme = 'light'
    }
    render(
      <App
        cwd={cwd}
        initialEngine={engineId}
        initialModel={model}
        autoDev={config.autoDev}
        autoFix={config.autoFix}
        autoProbe={config.autoProbe}
        autoCheck={config.autoCheck}
        autoReview={config.autoReview}
        fixModel={config.fixModel}
        bell={config.bell}
        budgetUsd={config.budgetUsd}
        initialTheme={theme}
      />,
    )
  })
}
