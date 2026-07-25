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

  // 2.1.211+: subagent output joins stream-json. The env-var form is a
  // no-op on older CLIs, unlike the flag, so the loops see spawned work
  // wherever it's supported.
  env: { CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1' },
  buildArgs(opts: RunOptions): string[] {
    const permissionMode =
      opts.mode === 'plan' ? 'plan' : opts.mode === 'yolo' ? 'bypassPermissions' : 'acceptEdits'
    const args = [
      '-p',
      opts.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',

      '--permission-mode',
      permissionMode,
    ]
    if (opts.model) args.push('--model', opts.model)
    if (opts.sessionId) args.push('--resume', opts.sessionId)
    return args
  },

  createParser: () => createClaudeStreamParser('claude'),
}
