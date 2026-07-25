import type { AgentEvent, Engine, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * Claude Code adapter. Drives `claude -p` in stream-json mode and normalizes
 * its ndjson events (system/assistant/user/result).
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
      '--permission-mode',
      'acceptEdits',
    ]
    if (opts.model) args.push('--model', opts.model)
    if (opts.sessionId) args.push('--resume', opts.sessionId)
    return args
  },

  parseLine(line: string): AgentEvent[] {
    let data: any
    try {
      data = JSON.parse(line)
    } catch {
      return [{ type: 'text', text: line }]
    }

    switch (data?.type) {
      case 'system':
        if (data.subtype === 'init') {
          const model = data.model ? ` · ${data.model}` : ''
          return [{ type: 'status', text: `claude ready${model}` }]
        }
        return []
      case 'assistant': {
        const events: AgentEvent[] = []
        for (const block of data.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            events.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            events.push({
              type: 'tool',
              name: block.name ?? 'tool',
              detail: summarizeToolInput(block.name, block.input),
            })
          }
        }
        return events
      }
      case 'result':
        return [
          {
            type: 'result',
            ok: data.subtype === 'success',
            summary: typeof data.result === 'string' ? data.result : undefined,
            sessionId: data.session_id,
            costUsd: data.total_cost_usd,
            durationMs: data.duration_ms,
          },
        ]
      case 'user':
        // Tool results echoed back to the model; not useful in the transcript.
        return []
      default:
        return [{ type: 'raw', data }]
    }
  },
}

function summarizeToolInput(name: string | undefined, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const obj = input as Record<string, unknown>
  // The most informative single field per common Claude Code tool.
  const key =
    typeof obj.file_path === 'string'
      ? obj.file_path
      : typeof obj.command === 'string'
        ? obj.command
        : typeof obj.pattern === 'string'
          ? obj.pattern
          : typeof obj.description === 'string'
            ? obj.description
            : undefined
  if (key) return truncate(key, 80)
  const json = JSON.stringify(obj)
  return json === '{}' ? undefined : truncate(json, 80)
}
