import type { AgentEvent, Engine, LineParser, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * OpenAI Codex CLI adapter. Drives `codex exec --json` (or
 * `codex exec resume <id>` for follow-ups) and normalizes its
 * thread/turn/item event stream. The legacy `{msg: {...}}` protocol from
 * older builds is handled as a fallback.
 */
export const codex: Engine = {
  id: 'codex',
  name: 'Codex CLI',
  binary: 'codex',
  install: 'npm install -g @openai/codex',
  supportsResume: true,

  buildArgs(opts: RunOptions): string[] {
    const sandbox =
      opts.mode === 'plan' ? 'read-only' : opts.mode === 'yolo' ? 'danger-full-access' : 'workspace-write'
    const args = ['exec']
    if (opts.sessionId) args.push('resume', opts.sessionId)
    args.push('--json', '--sandbox', sandbox, '--skip-git-repo-check')
    if (opts.model) args.push('--model', opts.model)
    args.push(opts.prompt)
    return args
  },

  createParser(): LineParser {
    let threadId: string | undefined

    return (line: string): AgentEvent[] => {
      let data: any
      try {
        data = JSON.parse(line)
      } catch {
        return [{ type: 'text', text: line }]
      }

      if (typeof data?.type === 'string') {
        switch (data.type) {
          case 'thread.started':
            threadId = data.thread_id
            return [{ type: 'status', text: 'codex ready' }]
          case 'item.started':
            return itemToEvents(data.item, 'started')
          case 'item.completed':
            return itemToEvents(data.item, 'completed')
          case 'turn.completed':
            return [{ type: 'result', ok: true, sessionId: threadId }]
          case 'turn.failed':
          case 'error':
            return [
              {
                type: 'result',
                ok: false,
                summary: data.error?.message ?? data.message ?? 'turn failed',
                sessionId: threadId,
              },
            ]
          default:
            if (data.type.startsWith('item.') || data.type.startsWith('turn.')) return []
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
    }
  },
}

function itemToEvents(item: any, phase: 'started' | 'completed'): AgentEvent[] {
  if (!item) return []
  switch (item.type) {
    case 'agent_message':
      // Only surface the completed message to avoid duplicates.
      return phase === 'completed' && item.text ? [{ type: 'text', text: item.text }] : []
    case 'command_execution':
      return phase === 'started'
        ? [{ type: 'tool', name: 'shell', detail: item.command ? truncate(item.command, 80) : undefined }]
        : []
    case 'file_change': {
      if (phase !== 'completed') return []
      const changes = Array.isArray(item.changes)
        ? item.changes.map((c: any) => c.path).filter(Boolean).join(', ')
        : undefined
      return [{ type: 'tool', name: 'edit', detail: changes ? truncate(changes, 80) : undefined }]
    }
    case 'reasoning':
      return phase === 'completed' && item.text ? [{ type: 'thinking', text: item.text }] : []
    case 'todo_list':
      return []
    default:
      return []
  }
}
