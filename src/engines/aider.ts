import type { Engine, RunOptions } from './types.js'

/**
 * Aider adapter. Fire-and-diff: no event stream, human text on stdout,
 * changes land as git commits (disabled here so squint owns the git flow).
 */
export const aider: Engine = {
  id: 'aider',
  name: 'Aider',
  binary: 'aider',
  install: 'python -m pip install aider-install && aider-install',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const args = ['--message', opts.prompt, '--yes-always', '--no-auto-commits']
    // plan = aider's dry-run: proposes edits without applying them.
    if (opts.mode === 'plan') args.push('--dry-run')
    if (opts.model) args.push('--model', opts.model)
    return args
  },
}
