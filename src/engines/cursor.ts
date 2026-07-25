import { createClaudeStreamParser } from './claudeProtocol.js'
import type { Engine, RunOptions } from './types.js'

/**
 * Cursor CLI adapter. Ships as `cursor-agent` (newer builds install plain
 * `agent`). Its stream-json output is approximately Claude-shaped; the
 * shared parser handles it defensively.
 */
export const cursor: Engine = {
  id: 'cursor',
  name: 'Cursor CLI',
  binary: 'cursor-agent',
  altBinaries: ['agent'],
  install: 'curl https://cursor.com/install -fsS | bash',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    const args = ['-p', opts.prompt, '--output-format', 'stream-json']
    if (opts.mode === 'plan') args.push('--mode', 'plan')
    else args.push('--force')
    if (opts.model) args.push('--model', opts.model)
    if (opts.sessionId) args.push(`--resume=${opts.sessionId}`)
    return args
  },

  createParser: () => createClaudeStreamParser('cursor'),
}
