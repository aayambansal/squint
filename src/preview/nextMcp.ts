import fs from 'node:fs'
import path from 'node:path'

/**
 * The framework's own channel: Next.js 16+ serves an MCP endpoint on
 * every dev server at /_next/mcp — build errors, runtime errors, routes
 * — because "agents can't see the browser". squint speaks just enough
 * of the Streamable HTTP transport to initialize, list tools, and pull
 * whatever error-shaped tools exist. Structured errors from the source
 * beat scraping the terminal; the log sweep stays as the fallback for
 * everything else.
 */
export interface NextMcpResult {
  available: boolean
  tools: string[]
  errors: string[]
}

interface JsonRpcResponse {
  result?: Record<string, unknown>
  error?: { message?: string }
}

function parseBody(contentType: string, text: string): JsonRpcResponse | null {
  try {
    if (contentType.includes('text/event-stream')) {
      // Last data: line wins — responses are single-message streams.
      const events = text.split('\n').filter((l) => l.startsWith('data:'))
      const last = events.at(-1)
      return last ? JSON.parse(last.slice(5).trim()) : null
    }
    return text.trim().length > 0 ? JSON.parse(text) : null
  } catch {
    return null
  }
}

async function rpc(
  url: string,
  sessionId: string | null,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ response: JsonRpcResponse | null; sessionId: string | null }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const newSession = res.headers.get('mcp-session-id') ?? sessionId
  if (res.status === 202) return { response: {}, sessionId: newSession }
  if (!res.ok) return { response: null, sessionId: newSession }
  const text = await res.text()
  return { response: parseBody(res.headers.get('content-type') ?? '', text), sessionId: newSession }
}

function extractText(result: Record<string, unknown> | undefined): string[] {
  const content = result?.content
  if (!Array.isArray(content)) return []
  return content
    .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
    .filter((t) => t.trim().length > 0)
}

/** Probe /_next/mcp: initialize → tools/list → call every error-shaped tool. */
export async function probeNextMcp(baseUrl: string, timeoutMs = 4000): Promise<NextMcpResult> {
  const url = new URL('/_next/mcp', baseUrl).toString()
  const none: NextMcpResult = { available: false, tools: [], errors: [] }
  let id = 0
  try {
    const init = await rpc(url, null, {
      jsonrpc: '2.0',
      id: ++id,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'squint', version: '0' },
      },
    }, timeoutMs)
    if (!init.response?.result) return none
    const session = init.sessionId
    await rpc(url, session, { jsonrpc: '2.0', method: 'notifications/initialized' }, timeoutMs).catch(() => null)

    const list = await rpc(url, session, { jsonrpc: '2.0', id: ++id, method: 'tools/list' }, timeoutMs)
    const toolDefs = (list.response?.result?.tools as { name?: string }[] | undefined) ?? []
    const tools = toolDefs.map((t) => String(t.name ?? '')).filter((n) => n.length > 0)

    const errors: string[] = []
    for (const name of tools.filter((n) => /error|issue|diagnostic/i.test(n)).slice(0, 3)) {
      const call = await rpc(url, session, {
        jsonrpc: '2.0',
        id: ++id,
        method: 'tools/call',
        params: { name, arguments: {} },
      }, timeoutMs)
      for (const text of extractText(call.response?.result)) {
        // Tools answer "no errors" in prose; only real failures matter.
        if (!/no (build |runtime )?errors|^\s*\[\]\s*$|no issues/i.test(text)) {
          errors.push(`[${name}] ${text.slice(0, 600)}`)
        }
      }
      if (errors.length >= 5) break
    }
    return { available: true, tools, errors }
  } catch {
    return none
  }
}

/** Next 16+ in this project's own package.json means the channel may exist. */
export function hasNextMcp(cwd: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    for (const key of ['dependencies', 'devDependencies']) {
      const range = pkg?.[key]?.next
      const major = range?.match(/(\d+)/)?.[1]
      if (major) return Number.parseInt(major, 10) >= 16
    }
  } catch {
    // fall through
  }
  return false
}
