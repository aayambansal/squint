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
    .command('ci')
    .description('One-shot verification for pipelines: gates (+ audits and flows with --url), JSON report, non-zero exit on failure')
    .option('--url <url>', 'also audit a running app URL (runtime, a11y, phantoms, jank) and replay flows')
    .option('--json <path>', 'write the machine-readable report here')
    .action(async (opts: { url?: string; json?: string }) => {
      const cwd = process.cwd()
      const startedAt = new Date().toISOString()
      const report: Record<string, unknown> = { startedAt, cwd }
      let failed = false

      const { detectGates, runGates } = await import('../gates/gates.js')
      const gates = detectGates(cwd)
      const gateResults = await runGates(cwd, gates, (result) => {
        console.log(`${result.ok ? pc.green('✓') : pc.red('✗')} ${result.gate.id} ${pc.dim(`${(result.durationMs / 1000).toFixed(1)}s`)}`)
        if (!result.ok) console.log(pc.dim(result.outputTail.split('\n').slice(-12).join('\n')))
      })
      report.gates = gateResults.map((r) => ({ id: r.gate.id, ok: r.ok, durationMs: r.durationMs, outputTail: r.ok ? undefined : r.outputTail }))
      if (gateResults.some((r) => !r.ok)) failed = true

      if (opts.url) {
        const { captureViewports, runtimeSummary, previewDir } = await import('../preview/preview.js')
        const capture = await captureViewports(cwd, opts.url)
        if (!capture) {
          console.log(pc.red('✗ audit: capture failed (Chrome missing or URL unreachable)'))
          report.audit = { ok: false }
          failed = true
        } else {
          const runtime = capture.runtime ? runtimeSummary(capture.runtime) : null
          const hard = {
            runtime,
            phantoms: capture.phantoms ?? [],
            viewTransitions: (capture.viewTransitions ?? []).filter((v) => v.startsWith('duplicate')),
            checkFailures: capture.checkFailures ?? [],
          }
          const advisories = {
            a11y: capture.a11y ?? [],
            slop: capture.slop ?? [],
            jank: capture.jank ?? [],
          }
          const hardCount = (runtime ? 1 : 0) + hard.phantoms.length + hard.viewTransitions.length + hard.checkFailures.length
          report.audit = { ok: hardCount === 0, hard, advisories, shots: capture.shots.map((s) => s.path) }
          if (hardCount > 0) {
            failed = true
            console.log(pc.red(`✗ audit: ${hardCount} hard finding(s)`))
            for (const [k, v] of Object.entries(hard)) {
              if (Array.isArray(v) && v.length > 0) console.log(pc.dim(`  ${k}: ${v.join(' · ')}`))
              else if (typeof v === 'string' && v) console.log(pc.dim(`  ${k}: ${v}`))
            }
          } else {
            console.log(`${pc.green('✓')} audit ${pc.dim(`(${advisories.a11y.length} a11y, ${advisories.slop.length} slop, ${advisories.jank.length} jank advisories)`)}`)
          }
        }

        const { loadFlows } = await import('../preview/flows.js')
        const flows = loadFlows(cwd)
        if (flows.length > 0) {
          const { findChrome } = await import('../preview/chrome.js')
          const chrome = findChrome()
          const flowReport: { name: string; ok: boolean; detail?: string }[] = []
          if (chrome) {
            const { runFlow } = await import('../preview/cdp.js')
            for (const flow of flows) {
              const result = await runFlow(chrome, opts.url, flow, previewDir(cwd))
              flowReport.push({ name: flow.name, ok: result.ok, detail: result.ok ? undefined : `step ${result.failedStep}: ${result.detail}` })
              console.log(result.ok ? `${pc.green('✓')} flow ${flow.name}` : pc.red(`✗ flow ${flow.name} — step ${result.failedStep}: ${result.detail}`))
              if (!result.ok) failed = true
            }
          }
          report.flows = flowReport
        }
      }

      report.ok = !failed
      report.finishedAt = new Date().toISOString()
      try {
        const { writeReceipt } = await import('../quality/receipts.js')
        console.log(pc.dim(`receipt → ${writeReceipt(cwd, report)}`))
      } catch {
        // receipts never fail the run
      }
      if (opts.json) {
        const fs = await import('node:fs')
        fs.writeFileSync(opts.json, JSON.stringify(report, null, 2))
        console.log(pc.dim(`report → ${opts.json}`))
      }
      if (failed) process.exitCode = 1
    })

  program
    .command('receipts')
    .description('List verification receipts; `squint receipts compare` diffs the two newest')
    .argument('[action]', 'compare — diff the two newest receipts')
    .action(async (action?: string) => {
      const cwd = process.cwd()
      const { latestPair, compareReceipts } = await import('../quality/compareReceipts.js')
      if (action === 'compare') {
        const pair = latestPair(cwd)
        if (!pair) {
          console.log(pc.dim('need at least two receipts in .squint/receipts/ — run squint ci twice'))
          return
        }
        const delta = compareReceipts(pair[0], pair[1])
        console.log(`${delta.okBefore ? pc.green('green') : pc.red('red')} → ${delta.okAfter ? pc.green('green') : pc.red('red')}`)
        for (const line of delta.lines) {
          console.log(line.includes('REGRESSED') || line.includes('⚠') ? pc.red(`  ${line}`) : pc.dim(`  ${line}`))
        }
        if (delta.lines.some((l) => l.includes('REGRESSED'))) process.exitCode = 1
        return
      }
      const fs = await import('node:fs')
      const path = await import('node:path')
      const dir = path.join(cwd, '.squint', 'receipts')
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse() : []
      if (files.length === 0) {
        console.log(pc.dim('no receipts yet — squint ci seals one per run'))
        return
      }
      for (const file of files.slice(0, 12)) {
        console.log(`${file.includes('-failed') ? pc.red('✗') : pc.green('✓')} ${file}`)
      }
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
