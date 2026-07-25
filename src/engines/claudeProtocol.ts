import type { AgentEvent, LineParser } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * Parser for the Claude Code stream-json wire protocol. Amp speaks it
 * verbatim and Cursor's agent CLI approximately, so all three adapters
 * share this. Stateful: tracks whether text deltas were emitted so the
 * complete assistant block can be flagged for dedupe.
 */
export function createClaudeStreamParser(readyLabel: string): LineParser {
  let sawTextDelta = false

  return (line: string): AgentEvent[] => {
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
          return [{ type: 'status', text: `${readyLabel} ready${model}` }]
        }
        return []

      case 'stream_event': {
        const delta = data.event?.delta
        if (data.event?.type === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) {
          sawTextDelta = true
          return [{ type: 'delta', text: delta.text }]
        }
        return []
      }

      case 'assistant': {
        // Skip subagent chatter; only surface the top-level thread.
        if (data.parent_tool_use_id) return []
        const events: AgentEvent[] = []
        for (const block of data.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            events.push({ type: 'text', text: block.text, streamed: sawTextDelta || undefined })
          } else if (block.type === 'thinking' && block.thinking) {
            events.push({ type: 'thinking', text: block.thinking })
          } else if (block.type === 'tool_use') {
            events.push({
              type: 'tool',
              name: block.name ?? 'tool',
              detail: summarizeToolInput(block.input),
            })
          }
        }
        sawTextDelta = false
        return events
      }

      case 'result':
        return [
          {
            type: 'result',
            ok: data.subtype === 'success' && data.is_error !== true,
            summary: typeof data.result === 'string' ? data.result : undefined,
            sessionId: data.session_id,
            costUsd: data.total_cost_usd,
            durationMs: data.duration_ms,
          },
        ]

      case 'user': {
        // Tool results echoed back to the model are noise — except failures,
        // which explain why the agent is retrying or changing course.
        if (data.parent_tool_use_id) return []
        const events: AgentEvent[] = []
        for (const block of data.message?.content ?? []) {
          if (block.type === 'tool_result' && block.is_error === true) {
            const raw = Array.isArray(block.content)
              ? block.content.map((c: any) => c?.text ?? '').join(' ')
              : String(block.content ?? '')
            const text = raw.trim().split('\n').at(-1) ?? ''
            if (text) events.push({ type: 'status', text: `⚠ tool error · ${truncate(text, 100)}` })
          }
        }
        return events
      }

      case 'rate_limit_event':
        // Housekeeping noise, not conversation.
        return []

      default:
        return [{ type: 'raw', data }]
    }
  }
}

function summarizeToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined
  const obj = input as Record<string, unknown>
  // The most informative single field per common tool shape.
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
