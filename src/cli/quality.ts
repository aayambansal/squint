import type { Command } from 'commander'
import pc from 'picocolors'

export function registerQuality(program: Command): void {
  program
    .command('check')
    .description('Run this project’s quality gates (typecheck, lint, format, test, build)')
    .action(async () => {
      const { detectGates, runGates } = await import('../gates/gates.js')
      const cwd = process.cwd()
      const gates = detectGates(cwd)
      if (gates.length === 0) {
        console.log(pc.dim('no gates detected (no package.json scripts, tsconfig, or eslint config)'))
        return
      }
      console.log(pc.dim(`running ${gates.map((g) => g.id).join(' → ')}`))
      const results = await runGates(cwd, gates, (result) => {
        const mark = result.ok ? pc.green('✓') : pc.red('✗')
        console.log(
          `${mark} ${result.gate.id.padEnd(10)} ${pc.dim(`${(result.durationMs / 1000).toFixed(1)}s · ${result.gate.display}`)}`,
        )
        if (!result.ok) console.log(pc.dim(result.outputTail.split('\n').slice(-12).join('\n')))
      })
      if (results.some((r) => !r.ok)) process.exitCode = 1
    })

  program
    .command('shot')
    .description('Screenshot a running app at mobile/tablet/desktop viewports (+ .squint/routes)')
    .argument('<url>', 'URL of the running app (e.g. http://localhost:5173)')
    .action(async (url: string) => {
      const { captureViewports } = await import('../preview/preview.js')
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
}
