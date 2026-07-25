import type { AgentEvent, Engine, LineParser, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * OpenCode adapter. `opencode run --format json` emits step/part JSONL;
 * sessions resume with `-s <sessionID>`. Model is addressed as
 * provider/model (e.g. anthropic/claude-sonnet-5).
 */
export const opencode: Engine = {
  id: 'opencode',
  name: 'OpenCode',
  binary: 'opencode',
  install: 'npm install -g opencode-ai',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    const args = ['run', '--format', 'json']
    if (opts.model) args.push('--model', opts.model)
    if (opts.sessionId) args.push('--session', opts.sessionId)
    args.push(opts.prompt)
    return args
  },

  createParser(): LineParser {
    let sessionId: string | undefined

    return (line: string): AgentEvent[] => {
      let data: any
      try {
        data = JSON.parse(line)
      } catch {
        return [{ type: 'text', text: line }]
      }

      if (data?.sessionID && !sessionId) sessionId = data.sessionID

      switch (data?.type) {
        case 'step_start':
          return []
        case 'text':
          return data.part?.text ? [{ type: 'text', text: data.part.text }] : []
        case 'reasoning':
          return data.part?.text ? [{ type: 'thinking', text: data.part.text }] : []
        case 'tool_use': {
          const name = data.part?.tool ?? 'tool'
          const input = data.part?.state?.input
          const detail =
            input && typeof input === 'object'
              ? truncate(
                  typeof input.command === 'string'
                    ? input.command
                    : typeof input.filePath === 'string'
                      ? input.filePath
                      : JSON.stringify(input),
                  80,
                )
              : undefined
          // Emit once per tool call: on the running/completed transition.
          if (data.part?.state?.status === 'completed' || data.part?.state?.status === 'running') {
            return [{ type: 'tool', name, detail }]
          }
          return []
        }
        case 'step_finish':
          if (data.part?.reason === 'stop' || data.reason === 'stop') {
            return [{ type: 'result', ok: true, sessionId }]
          }
          return []
        case 'error':
          return [{ type: 'error', text: data.message ?? 'opencode error' }]
        default:
          return [{ type: 'raw', data }]
      }
    }
  },
}
