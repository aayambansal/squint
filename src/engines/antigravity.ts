import type { AgentEvent, Engine, LineParser, RunOptions } from './types.js'

/**
 * Google Antigravity CLI adapter (the Gemini CLI successor). Headless
 * is `agy -p`, resume is `--conversation <id>` — but agy gates stdout
 * on isatty(): piped output is EMPTY with exit 0. The fix is a pty,
 * allocated with the stock `script` utility (BSD and util-linux arg
 * shapes differ), then stripping the ANSI/carriage-return repaints a
 * pty brings with it. Naive wrappers silently get nothing.
 */
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]/g

const shellQuote = (arg: string): string => `'${arg.replace(/'/g, `'\\''`)}'`

export const antigravity: Engine = {
  id: 'antigravity',
  name: 'Antigravity CLI',
  binary: 'agy',
  install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    const args = ['-p', opts.prompt]
    // plan constrains the sandbox; yolo drops the permission gate; safe
    // rides agy's defaults (persisted settings.json policies apply).
    if (opts.mode === 'plan') args.push('--sandbox')
    if (opts.mode === 'yolo') args.push('--dangerously-skip-permissions')
    if (opts.model) args.push('-m', opts.model)
    if (opts.sessionId) args.push('--conversation', opts.sessionId)
    return args
  },

  wrapCommand(binaryPath: string, args: string[]): { binary: string; args: string[] } {
    if (process.platform === 'darwin') {
      // BSD script: script -q /dev/null <cmd> <args...>
      return { binary: 'script', args: ['-q', '/dev/null', binaryPath, ...args] }
    }
    // util-linux script: script -qec '<cmd>' /dev/null
    const command = [binaryPath, ...args].map(shellQuote).join(' ')
    return { binary: 'script', args: ['-qec', command, '/dev/null'] }
  },

  createParser(): LineParser {
    return (line: string): AgentEvent[] => {
      const clean = line.replace(ANSI_RE, '').replace(/\r/g, '').trimEnd()
      if (clean.trim().length === 0) return []
      // Spinner/status frames a pty leaks: single glyphs and repaints.
      if (/^[⠁⠂⠄⡀⢀⠠⠐⠈▐▌│┃⣿]+$/.test(clean.trim())) return []
      return [{ type: 'text', text: clean }]
    }
  },
}
