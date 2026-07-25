import type { Command } from 'commander'
import pc from 'picocolors'
import { defaultPaths, loadConfig, setConfigValue } from '../config/config.js'

export function registerConfig(program: Command): void {
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
    .description('Set a value (see docs/configuration.md for every key)')
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
}
