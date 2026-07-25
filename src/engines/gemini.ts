import type { AgentEvent, Engine, LineParser, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * Gemini CLI adapter. Streams ndjson via --output-format stream-json
 * (init/message/tool_use/tool_result/error/result events). The stream
 * has had fidelity bugs upstream, so parsing is defensive and non-json
 * lines pass through as text.
 */
export const gemini: Engine = {
  id: 'gemini',
  name: 'Gemini CLI',
  binary: 'gemini',
  install: 'npm install -g @google/gemini-cli',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const approval = opts.mode === 'plan' ? 'plan' : opts.mode === 'yolo' ? 'yolo' : 'auto_edit'
    const args = ['-p', opts.prompt, '--output-format', 'stream-json', '--approval-mode', approval]
    if (opts.model) args.push('-m', opts.model)
    return args
  },

  createParser(): LineParser {
    return (line: string): AgentEvent[] => {
      let data: any
      try {
        data = JSON.parse(line)
      } catch {
        return [{ type: 'text', text: line }]
      }

      switch (data?.type) {
        case 'init':
          return [{ type: 'status', text: `gemini ready${data.model ? ` · ${data.model}` : ''}` }]
        case 'message': {
          // Assistant chunks carry content under a few historical keys.
          if (data.role && data.role !== 'assistant' && data.role !== 'model') return []
          const text = data.content ?? data.text ?? data.delta
          return typeof text === 'string' && text.length > 0 ? [{ type: 'text', text }] : []
        }
        case 'tool_use': {
          const name = data.name ?? data.tool_name ?? 'tool'
          const input = data.args ?? data.input
          const detail =
            input && typeof input === 'object' ? truncate(JSON.stringify(input), 80) : undefined
          return [{ type: 'tool', name, detail }]
        }
        case 'tool_result':
          return []
        case 'error':
          return data.fatal === false
            ? []
            : [{ type: 'error', text: data.message ?? 'gemini error' }]
        case 'result':
          return [
            {
              type: 'result',
              ok: !data.error,
              summary: typeof data.response === 'string' ? data.response : undefined,
            },
          ]
        default:
          return [{ type: 'raw', data }]
      }
    }
  },
}
