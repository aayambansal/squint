import type { Command } from 'commander'
import pc from 'picocolors'
import { defaultPaths, loadConfig, resolveEngineId, resolveModel } from '../config/config.js'
import { getEngine } from '../engines/registry.js'

export function registerProject(program: Command): void {
  const skillsCommand = program
    .command('skills')
    .description('Project knowledge injected into asks (.squint/rules.md + .squint/skills/)')

  skillsCommand
    .command('list')
    .description('Show always-on rules and trigger-matched skills')
    .action(async () => {
      const { loadRules, loadSkills } = await import('../prompt/skills.js')
      const cwd = process.cwd()
      const rules = loadRules(cwd)
      console.log(
        rules
          ? `${pc.green('✓')} rules.md ${pc.dim(`(${rules.split('\n').length} lines, always on)`)}`
          : pc.dim('○ no .squint/rules.md'),
      )
      const skills = loadSkills(cwd)
      if (skills.length === 0) {
        console.log(pc.dim('○ no skills — squint skills init writes an example'))
        return
      }
      for (const skill of skills) {
        console.log(`${pc.green('✓')} ${skill.name.padEnd(20)} ${pc.dim(`triggers: ${skill.triggers.join(', ')}`)}`)
      }
    })

  skillsCommand
    .command('init')
    .description('Scaffold .squint/rules.md and an example skill')
    .action(async () => {
      const fs = await import('node:fs')
      const nodePath = await import('node:path')
      const cwd = process.cwd()
      const skillsDir = nodePath.join(cwd, '.squint', 'skills')
      fs.mkdirSync(skillsDir, { recursive: true })
      const rules = nodePath.join(cwd, '.squint', 'rules.md')
      if (!fs.existsSync(rules)) {
        fs.writeFileSync(
          rules,
          '# Project rules\n\nThese ride along on every squint ask. Keep them short — cut anything that would not cause a mistake if removed.\n',
        )
        console.log(pc.green('✓ .squint/rules.md'))
      }
      const example = nodePath.join(skillsDir, 'example.md')
      if (!fs.existsSync(example)) {
        fs.writeFileSync(
          example,
          '---\ntriggers: example, sample\n---\n\nThis note is injected only when an ask mentions one of the triggers above.\nDocument the parts of this repo an agent would otherwise rediscover every time:\nwhere state lives, which helpers to reuse, what not to touch.\n',
        )
        console.log(pc.green('✓ .squint/skills/example.md'))
      }
      console.log(pc.dim('rules are always-on; skills inject when an ask mentions a trigger'))
    })

  program
    .command('brief')
    .description('Set a committed design direction for this project (.squint/brief.md)')
    .argument('[family]', 'aesthetic family id (omit to list)')
    .option('--force', 'overwrite an existing project brief')
    .action(async (familyId: string | undefined, options: { force?: boolean }) => {
      const fs = await import('node:fs')
      const nodePath = await import('node:path')
      const { FAMILIES, getFamily, renderFamilyBrief } = await import('../prompt/families.js')
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
        const { isGitRepo } = await import('../vcs/snapshot.js')
        if (!isGitRepo(cwd)) {
          console.error(pc.red('✗ variants need a git repo with at least one commit'))
          process.exitCode = 1
          return
        }
        const { runVariants, cleanVariants } = await import('../variants/variants.js')
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
          const { screenshotVariants } = await import('../variants/shots.js')
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
      const { listVariants } = await import('../variants/variants.js')
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
      const { applyVariant, cleanVariants } = await import('../variants/variants.js')
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
      const { cleanVariants } = await import('../variants/variants.js')
      const count = cleanVariants(process.cwd())
      console.log(pc.dim(`removed ${count} variant(s)`))
    })
}
