import { createClaudeStreamParser } from './claudeProtocol.js'
import type { Engine, RunOptions } from './types.js'

/**
 * Claude Code adapter. Drives `claude -p` in stream-json mode with
 * partial messages so the TUI can stream tokens as they arrive.
 */
export const claude: Engine = {
  id: 'claude',
  name: 'Claude Code',
  binary: 'claude',
  install: 'npm install -g @anthropic-ai/claude-code',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    const args = [
      '-p',
      opts.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
    ]
    if (opts.model) args.push('--model', opts.model)
    if (opts.sessionId) args.push('--resume', opts.sessionId)
    return args
  },

  createParser: () => createClaudeStreamParser('claude'),
}
