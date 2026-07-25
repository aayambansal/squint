import { createClaudeStreamParser } from './claudeProtocol.js'
import type { Engine, RunOptions } from './types.js'

/**
 * Amp (Sourcegraph) adapter. Amp's --stream-json speaks the Claude Code
 * wire protocol verbatim, so the shared parser applies. Resume rides
 * `amp threads continue`, which targets the most recent thread.
 */
export const amp: Engine = {
  id: 'amp',
  name: 'Amp',
  binary: 'amp',
  install: 'npm install -g @sourcegraph/amp',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    if (opts.sessionId) {
      return ['threads', 'continue', '--execute', opts.prompt, '--stream-json']
    }
    return ['-x', opts.prompt, '--stream-json']
  },

  createParser: () => createClaudeStreamParser('amp'),
}
