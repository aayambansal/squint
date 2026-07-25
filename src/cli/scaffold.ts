import type { Command } from 'commander'
import pc from 'picocolors'

export function registerScaffold(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new Vite + React + TS + Tailwind app with token-first CSS')
    .argument('[dir]', 'target directory', '.')
    .option('--force', 'write into a non-empty directory')
    .option('--no-install', 'skip npm install')
    .action(async (dir: string, options: { force?: boolean; install: boolean }) => {
      const { installDependencies, writeTemplate } = await import('../scaffold/init.js')
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
      const { patchViteConfig, TAGGER_FILENAME, TAGGER_SOURCE } = await import('../tagger/source.js')
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
      console.log(
        pc.dim('\nin the running app: Alt+S → click elements to pin, alt+enter copies all — paste into squint'),
      )
    })
}
