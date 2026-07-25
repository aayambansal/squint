import type { Engine, RunOptions } from './types.js'

/**
 * OpenCode adapter. `opencode run` prints plain text in non-interactive
 * mode; model is addressed as provider/model (e.g. anthropic/claude-sonnet-5).
 */
export const opencode: Engine = {
  id: 'opencode',
  name: 'OpenCode',
  binary: 'opencode',
  install: 'npm install -g opencode-ai',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const args = ['run', opts.prompt]
    if (opts.model) args.push('--model', opts.model)
    return args
  },
}
