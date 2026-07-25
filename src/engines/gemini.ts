import type { Engine, RunOptions } from './types.js'

/**
 * Gemini CLI adapter. Non-interactive mode prints plain text, so no
 * parseLine — the runner forwards stdout lines as text events.
 */
export const gemini: Engine = {
  id: 'gemini',
  name: 'Gemini CLI',
  binary: 'gemini',
  install: 'npm install -g @google/gemini-cli',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const args = ['-p', opts.prompt, '--yolo']
    if (opts.model) args.push('-m', opts.model)
    return args
  },
}
