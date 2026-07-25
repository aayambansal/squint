import type { AgentEvent, Engine, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * OpenAI Codex CLI adapter. Drives `codex exec --json` and normalizes its
 * event stream. Codex has shipped two ndjson shapes over time (the legacy
 * `{msg: {...}}` protocol and the newer `{type: "item.completed", item}` one);
 * both are handled defensively.
 */
export const codex: Engine = {
  id: 'codex',
  name: 'Codex CLI',
  binary: 'codex',
  install: 'npm install -g @openai/codex',
  supportsResume: false,

  buildArgs(opts: RunOptions): string[] {
    const args = ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check']
    if (opts.model) args.push('--model', opts.model)
    args.push(opts.prompt)
    return args
  },

  parseLine(line: string): AgentEvent[] {
    let data: any
    try {
      data = JSON.parse(line)
    } catch {
      return [{ type: 'text', text: line }]
    }

    // Newer shape: {type: "item.completed", item: {...}}
    if (typeof data?.type === 'string') {
      if (data.type === 'item.completed' && data.item) {
        return itemToEvents(data.item)
      }
      if (data.type === 'turn.completed') {
        return [{ type: 'result', ok: true }]
      }
      if (data.type === 'turn.failed' || data.type === 'error') {
        return [{ type: 'result', ok: false, summary: data.error?.message ?? 'turn failed' }]
      }
      if (data.type.startsWith('item.') || data.type.startsWith('turn.') || data.type === 'thread.started') {
        return []
      }
    }

    // Legacy shape: {id, msg: {type, ...}}
    const msg = data?.msg
    if (msg && typeof msg.type === 'string') {
      switch (msg.type) {
        case 'agent_message':
          return msg.message ? [{ type: 'text', text: msg.message }] : []
        case 'agent_reasoning':
          return []
        case 'exec_command_begin':
          return [
            {
              type: 'tool',
              name: 'shell',
              detail: Array.isArray(msg.command) ? truncate(msg.command.join(' '), 80) : undefined,
            },
          ]
        case 'patch_apply_begin':
          return [{ type: 'tool', name: 'edit' }]
        case 'task_complete':
          return [{ type: 'result', ok: true, summary: msg.last_agent_message }]
        case 'error':
          return [{ type: 'error', text: msg.message ?? 'codex error' }]
        default:
          return []
      }
    }

    return [{ type: 'raw', data }]
  },
}

function itemToEvents(item: any): AgentEvent[] {
  switch (item.type) {
    case 'agent_message':
      return item.text ? [{ type: 'text', text: item.text }] : []
    case 'command_execution':
      return [{ type: 'tool', name: 'shell', detail: item.command ? truncate(item.command, 80) : undefined }]
    case 'file_change': {
      const changes = Array.isArray(item.changes)
        ? item.changes.map((c: any) => c.path).filter(Boolean).join(', ')
        : undefined
      return [{ type: 'tool', name: 'edit', detail: changes ? truncate(changes, 80) : undefined }]
    }
    case 'reasoning':
      return []
    default:
      return []
  }
}
