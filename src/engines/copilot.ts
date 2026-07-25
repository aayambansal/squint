import type { Engine, RunOptions } from './types.js'

/**
 * GitHub Copilot CLI adapter. No JSON output mode exists yet, so this is
 * a plain-text backend: `-s` keeps stdout clean for piping.
 */
export const copilot: Engine = {
  id: 'copilot',
  name: 'Copilot CLI',
  binary: 'copilot',
  install: 'npm install -g @github/copilot',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const args = ['-p', opts.prompt, '-s', '--allow-all-tools']
    if (opts.model) args.push('--model', opts.model)
    return args
  },
}
