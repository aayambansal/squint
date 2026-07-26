import type { AgentEvent, Engine, LineParser, RunOptions } from './types.js'
import { truncate } from '../util/stream.js'

/**
 * Codex over the app-server protocol — the JSON-RPC surface OpenAI
 * ships as the single backend for CLI/desktop/IDE (threads, turns,
 * streamed items) instead of scraping `codex exec` output. squint's
 * runner only pipes stdout, so the adapter embeds a driver (the
 * tagger's trick): node runs DRIVER_SOURCE, which owns a
 * `codex app-server` child, performs initialize → thread/start (or
 * thread/resume) → turn/start, and re-emits the notification stream as
 * normalized JSONL for the parser below. SQUINT_CODEX_BIN overrides
 * the binary for tests.
 */
const DRIVER_SOURCE = String.raw`
const { spawn } = require('node:child_process');
const opts = JSON.parse(process.argv[1]);
const bin = process.env.SQUINT_CODEX_BIN || 'codex';
const child = spawn(bin, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], cwd: opts.cwd });
const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
let threadId = opts.resume || null;
let done = false;
const finish = (ok, error) => {
  if (done) return;
  done = true;
  emit({ kind: 'result', ok, sessionId: threadId || undefined, error });
  try { child.kill(); } catch {}
  process.exit(ok ? 0 : 1);
};
process.on('SIGTERM', () => finish(false, 'interrupted'));
process.on('SIGINT', () => finish(false, 'interrupted'));
setTimeout(() => finish(false, 'app-server timeout'), 30 * 60 * 1000).unref();
child.on('exit', () => finish(false, 'app-server exited early'));
child.stderr.on('data', () => {});
let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.error && msg.id !== undefined) return finish(false, String(msg.error.message || 'app-server error'));
    if (msg.id === 1 && msg.result !== undefined) {
      send({ jsonrpc: '2.0', method: 'initialized' });
      if (threadId) send({ jsonrpc: '2.0', id: 2, method: 'thread/resume', params: { threadId } });
      else send({ jsonrpc: '2.0', id: 2, method: 'thread/start', params: {
        cwd: opts.cwd, sandbox: opts.sandbox, approvalPolicy: 'never', model: opts.model || null,
      } });
      continue;
    }
    if (msg.id === 2 && msg.result !== undefined) {
      threadId = (msg.result.thread && msg.result.thread.id) || msg.result.threadId || threadId;
      send({ jsonrpc: '2.0', id: 3, method: 'turn/start', params: {
        threadId, input: [{ type: 'text', text: opts.prompt }],
        model: opts.model || null, sandboxPolicy: null, cwd: opts.cwd,
      } });
      continue;
    }
    switch (msg.method) {
      case 'item/agentMessage/delta':
        emit({ kind: 'delta', text: msg.params.delta });
        break;
      case 'item/reasoning/summaryTextDelta':
      case 'item/reasoning/textDelta':
        emit({ kind: 'thinking' });
        break;
      case 'item/started': {
        const item = msg.params.item || {};
        if (item.type === 'commandExecution') emit({ kind: 'tool', name: 'shell', detail: item.command });
        else if (item.type === 'fileChange') emit({ kind: 'tool', name: 'edit', detail: item.path });
        else if (item.type === 'mcpToolCall') emit({ kind: 'tool', name: item.tool || 'mcp' });
        else if (item.type === 'webSearch') emit({ kind: 'tool', name: 'search' });
        break;
      }
      case 'item/completed': {
        const item = msg.params.item || {};
        if (item.type === 'agentMessage' && item.text) emit({ kind: 'message', text: item.text });
        break;
      }
      case 'error':
        emit({ kind: 'note', text: String((msg.params && msg.params.message) || 'error') });
        break;
      case 'turn/completed': {
        const status = msg.params && msg.params.turn && msg.params.turn.status;
        finish(status === 'completed', status === 'completed' ? undefined : String(status));
        break;
      }
    }
  }
});
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'squint', title: 'squint', version: '0' } } });
`

export const codexApp: Engine = {
  id: 'codex-app',
  name: 'Codex (app-server)',
  binary: 'node',
  install: 'npm install -g @openai/codex (requires codex on PATH)',
  supportsResume: true,
  env: {},

  buildArgs(opts: RunOptions): string[] {
    const sandbox =
      opts.mode === 'plan' ? 'read-only' : opts.mode === 'yolo' ? 'danger-full-access' : 'workspace-write'
    const payload = {
      prompt: opts.prompt,
      cwd: opts.cwd,
      model: opts.model,
      sandbox,
      resume: opts.sessionId,
    }
    return ['-e', DRIVER_SOURCE, JSON.stringify(payload)]
  },

  createParser(): LineParser {
    let streamed = false
    return (line: string): AgentEvent[] => {
      let data: { kind?: string; text?: string; name?: string; detail?: string; ok?: boolean; sessionId?: string; error?: string }
      try {
        data = JSON.parse(line)
      } catch {
        return []
      }
      switch (data.kind) {
        case 'delta':
          streamed = true
          return [{ type: 'delta', text: data.text ?? '' }]
        case 'message':
          if (streamed) {
            streamed = false
            return [{ type: 'text', text: data.text ?? '', streamed: true }]
          }
          return [{ type: 'text', text: data.text ?? '' }]
        case 'thinking':
          return [{ type: 'thinking', text: '' }]
        case 'tool':
          return [{ type: 'tool', name: data.detail ? `${data.name}: ${truncate(data.detail, 80)}` : (data.name ?? 'tool') }]
        case 'note':
          return [{ type: 'status', text: data.text ?? '' }]
        case 'result':
          return [{ type: 'result', ok: data.ok === true, sessionId: data.sessionId, summary: data.error }]
        default:
          return []
      }
    }
  },
}
