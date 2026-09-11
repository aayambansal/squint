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
    .description('Show always-on rules, bundled design skills, project skills, and external SKILL.md folders')
    .action(async () => {
      const { loadExternalSkills, loadRules, loadSkills } = await import('../prompt/skills.js')
      const { BUNDLED_SKILLS, describeActivation } = await import('../prompt/library/index.js')
      const { detectPlatforms } = await import('../prompt/platform.js')
      const { defaultPaths, loadConfig } = await import('../config/config.js')
      const cwd = process.cwd()
      const rules = loadRules(cwd)
      console.log(
        rules
          ? `${pc.green('✓')} rules.md ${pc.dim(`(${rules.split('\n').length} lines, always on)`)}`
          : pc.dim('○ no .squint/rules.md'),
      )

      const platforms = detectPlatforms(cwd)
      const projectSkills = loadSkills(cwd)
      const shadowed = new Set(projectSkills.map((s) => s.name))
      const bundledOn = loadConfig(defaultPaths(cwd)).bundledSkills !== false
      console.log(pc.bold(`\nbundled${bundledOn ? '' : pc.red(' (off — squint config set bundledSkills true)')}`) + pc.dim(`  · platforms detected: ${platforms.join(', ')}`))
      for (const skill of BUNDLED_SKILLS) {
        const targeted = !skill.platforms || skill.platforms.some((p) => platforms.includes(p))
        const mark = shadowed.has(skill.name) ? pc.yellow('↷') : targeted ? pc.green('✓') : pc.dim('○')
        const when = shadowed.has(skill.name) ? `shadowed by .squint/skills/${skill.name}.md` : describeActivation(skill)
        console.log(`${mark} ${skill.name.padEnd(18)} ${skill.summary}\n  ${pc.dim(when)}`)
      }

      console.log(pc.bold('\nproject (.squint/skills/)'))
      if (projectSkills.length === 0) {
        console.log(pc.dim('○ none — squint skills init writes an example; squint skills eject <name> forks a bundled one'))
      }
      for (const skill of projectSkills) {
        console.log(`${pc.green('✓')} ${skill.name.padEnd(18)} ${pc.dim(`triggers: ${skill.triggers.join(', ')}`)}`)
      }

      const external = loadExternalSkills(cwd)
      if (external.length > 0) {
        console.log(pc.bold('\nexternal SKILL.md') + pc.dim('  · injected as a pointer when an ask mentions the name'))
        for (const skill of external) {
          console.log(`${pc.green('✓')} ${skill.name.padEnd(18)} ${pc.dim(skill.file ?? '')}`)
        }
      }
    })

  skillsCommand
    .command('show')
    .description('Print a bundled skill')
    .argument('<name>', 'bundled skill name (squint skills list)')
    .action(async (name: string) => {
      const { getBundledSkill } = await import('../prompt/library/index.js')
      const skill = getBundledSkill(name)
      if (!skill) {
        console.error(pc.red(`✗ no bundled skill "${name}" — squint skills list`))
        process.exitCode = 1
        return
      }
      console.log(skill.body)
    })

  skillsCommand
    .command('eject')
    .description('Copy a bundled skill into .squint/skills/<name>.md so this repo can edit it (the copy shadows the original)')
    .argument('<name>', 'bundled skill name (squint skills list)')
    .option('--force', 'overwrite an existing project skill of the same name')
    .action(async (name: string, options: { force?: boolean }) => {
      const fs = await import('node:fs')
      const nodePath = await import('node:path')
      const { getBundledSkill } = await import('../prompt/library/index.js')
      const skill = getBundledSkill(name)
      if (!skill) {
        console.error(pc.red(`✗ no bundled skill "${name}" — squint skills list`))
        process.exitCode = 1
        return
      }
      const target = nodePath.join(process.cwd(), '.squint', 'skills', `${skill.name}.md`)
      if (fs.existsSync(target) && !options.force) {
        console.error(pc.red(`✗ ${target} exists — use --force to overwrite`))
        process.exitCode = 1
        return
      }
      fs.mkdirSync(nodePath.dirname(target), { recursive: true })
      fs.writeFileSync(target, `---\nname: ${skill.name}\ntriggers: ${skill.triggers.join(', ')}\n---\n\n${skill.body}\n`)
      console.log(pc.green(`✓ ${target}`))
      console.log(pc.dim('edit freely — this copy now shadows the bundled skill for this repo'))
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
      console.log(pc.dim('rules are always-on; skills inject when an ask mentions a trigger · squint skills list shows the bundled design library'))
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

  const sandboxCommand = program
    .command('sandbox')
    .description('Cumulative diff worktree — asks accumulate until you apply')

  sandboxCommand
    .command('diff')
    .description('Show accumulated sandbox changes')
    .action(async () => {
      const { sandboxDiffStat, sandboxExists, sandboxFiles } = await import('../vcs/sandbox.js')
      const cwd = process.cwd()
      if (!sandboxExists(cwd)) {
        console.log(pc.dim('no sandbox open — /sandbox on inside the TUI'))
        return
      }
      const stat = sandboxDiffStat(cwd)
      if (!stat) {
        console.log(pc.dim('sandbox is clean'))
        return
      }
      console.log(stat)
      for (const line of sandboxFiles(cwd)) console.log(pc.dim(line))
    })

  sandboxCommand
    .command('apply')
    .description('Land the sandbox diff on the real tree and close it')
    .action(async () => {
      const { applySandbox, discardSandbox } = await import('../vcs/sandbox.js')
      const cwd = process.cwd()
      const result = applySandbox(cwd)
      if (!result.ok) {
        console.error(pc.red(`✗ ${result.detail}`))
        process.exitCode = 1
        return
      }
      discardSandbox(cwd)
      console.log(pc.green('✓ sandbox applied to the real tree') + pc.dim(' — review with git diff'))
    })

  sandboxCommand
    .command('discard')
    .description('Close the sandbox without touching the real tree')
    .action(async () => {
      const { discardSandbox } = await import('../vcs/sandbox.js')
      const had = discardSandbox(process.cwd())
      console.log(pc.dim(had ? 'sandbox discarded' : 'no sandbox open'))
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
