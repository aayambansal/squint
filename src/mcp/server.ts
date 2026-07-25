import readline from 'node:readline'
import { contextReport, formatContextReport } from '../quality/contextDoctor.js'
import { detectGates, runGates } from '../gates/gates.js'
import { loadFlows } from '../preview/flows.js'
import { findChrome } from '../preview/chrome.js'
import { captureViewports, previewDir, runtimeSummary } from '../preview/preview.js'

/**
 * `squint mcp`: the gates as MCP tools over stdio, so any MCP-speaking
 * agent — Copilot, Cursor, Codex, Claude — invokes squint's
 * verification natively, no adapter required. Distribution flows the
 * other way here: instead of squint wrapping the agent, the agent
 * calls squint. Minimal protocol surface (initialize, tools/list,
 * tools/call), same JSON-RPC shapes the nextMcp client speaks.
 */
interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run(args: Record<string, unknown>, cwd: string): Promise<string>
}

const TOOLS: McpTool[] = [
  {
    name: 'squint_check',
    description:
      'Run the repo quality gates (typecheck, lint, format, test, build as detected). Returns each gate with pass/fail and failure output.',
    inputSchema: { type: 'object', properties: {} },
    async run(_args, cwd) {
      const gates = detectGates(cwd)
      if (gates.length === 0) return 'no gates detected (no package.json scripts or known tools)'
      const results = await runGates(cwd, gates)
      return results
        .map((r) => `${r.ok ? '✓' : '✗'} ${r.gate.display}${r.ok ? '' : `\n${r.outputTail.slice(-1500)}`}`)
        .join('\n')
    },
  },
  {
    name: 'squint_shot',
    description:
      'Screenshot and audit a running app URL headlessly: runtime errors, accessibility sweep, anti-slop tells, phantom classes, view-transition breakage, jank attribution, screen-reader narration. Returns findings; screenshots land in .squint/preview/.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async run(args, cwd) {
      const url = String(args.url ?? '')
      const result = await captureViewports(cwd, url)
      if (!result) return 'capture failed — is Chrome installed and the URL reachable?'
      const sections: string[] = [`shots: ${result.shots.map((s) => s.path).join(', ')}`]
      const runtime = result.runtime ? runtimeSummary(result.runtime) : null
      if (runtime) sections.push(`runtime: ${runtime}`)
      for (const [label, list] of [
        ['a11y', result.a11y],
        ['slop', result.slop],
        ['phantom classes', result.phantoms],
        ['view transitions', result.viewTransitions],
        ['jank', result.jank],
        ['components', result.components],
      ] as const) {
        if (list && list.length > 0) sections.push(`${label}:\n${list.join('\n')}`)
      }
      return sections.join('\n\n')
    },
  },
  {
    name: 'squint_flows',
    description:
      'Replay the repo\'s declared user journeys (.squint/flows/*.flow) headlessly against a URL. Returns pass/fail per flow with the failing step.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async run(args, cwd) {
      const url = String(args.url ?? '')
      const flows = loadFlows(cwd)
      if (flows.length === 0) return 'no flows declared — add .squint/flows/<name>.flow'
      const chrome = findChrome()
      if (!chrome) return 'no Chrome/Chromium found'
      const { runFlow } = await import('../preview/cdp.js')
      const lines: string[] = []
      for (const flow of flows) {
        const result = await runFlow(chrome, url, flow, previewDir(cwd))
        lines.push(
          result.ok
            ? `✓ ${flow.name} (${flow.steps.length} steps)`
            : `✗ ${flow.name} at step ${result.failedStep}: ${result.detail}`,
        )
      }
      return lines.join('\n')
    },
  },
  {
    name: 'squint_context',
    description:
      'Itemize what squint injects into engine asks — token cost per source with staleness warnings (stale locks, generic skill triggers, oversized always-on context).',
    inputSchema: { type: 'object', properties: {} },
    async run(_args, cwd) {
      return formatContextReport(contextReport(cwd))
    },
  },
]

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export function runMcpServer(
  cwd: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): void {
  const write = (msg: Record<string, unknown>) => output.write(`${JSON.stringify(msg)}\n`)
  const rl = readline.createInterface({ input })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let req: JsonRpcRequest
    try {
      req = JSON.parse(line)
    } catch {
      return
    }
    void handle(req, cwd, write)
  })
}

async function handle(
  req: JsonRpcRequest,
  cwd: string,
  write: (msg: Record<string, unknown>) => void,
): Promise<void> {
  const reply = (result: Record<string, unknown>) => {
    if (req.id !== undefined) write({ jsonrpc: '2.0', id: req.id, result })
  }
  const fail = (code: number, message: string) => {
    if (req.id !== undefined) write({ jsonrpc: '2.0', id: req.id, error: { code, message } })
  }
  switch (req.method) {
    case 'initialize':
      reply({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'squint', version: '0' },
      })
      return
    case 'notifications/initialized':
    case 'ping':
      if (req.method === 'ping') reply({})
      return
    case 'tools/list':
      reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
      return
    case 'tools/call': {
      const name = String(req.params?.name ?? '')
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return fail(-32602, `unknown tool: ${name}`)
      try {
        const text = await tool.run((req.params?.arguments as Record<string, unknown>) ?? {}, cwd)
        reply({ content: [{ type: 'text', text }] })
      } catch (error) {
        reply({
          content: [{ type: 'text', text: `tool failed: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        })
      }
      return
    }
    default:
      fail(-32601, `method not found: ${req.method}`)
  }
}
