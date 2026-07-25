# Engine headless interfaces + TUI stack

Research snapshot (2026-07-25), verified against official docs. Exact invocation recipes per backend, wire-protocol families, and TUI patterns worth stealing.

## Wire-protocol families

Three families cover every backend:
- **(A) Claude stream-json**: Claude Code, **Amp (verbatim compatible)**, Cursor CLI (approximately)
- **(B) Codex thread/turn/item**: Codex CLI
- **(C) Per-tool ad hoc**: OpenCode step/part, Gemini init/message/result, Copilot & Aider plain text

Normalize onto one internal union: `session_started · text_delta · assistant_text · thinking · tool_call started/finished (name, input, output, exit_code) · file_change · usage · result{text, cost, error}`.

## 1. Claude Code

Docs: https://code.claude.com/docs/en/cli-reference · /headless

```bash
claude -p "task" --output-format stream-json --input-format stream-json \
  --verbose --include-partial-messages --permission-mode acceptEdits \
  --allowedTools "Bash(git diff *),Read,Edit" --model claude-sonnet-5 \
  --session-id <uuid> --append-system-prompt "…"
```

Key flags: `--include-partial-messages` (token-level `stream_event` deltas; needs `-p --output-format stream-json --verbose`); `--input-format stream-json` (multi-turn over stdin: write `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"…"}]}}` lines); `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions`; `--resume <id>` / `--continue` / `--fork-session` (resume scoped to cwd); `--max-turns N`, `--max-budget-usd X`; `--json-schema` (validated structured output); `--bare` (skips hooks/skills/CLAUDE.md/OAuth — API-key-only, so NOT a default for subscription users); `--mcp-config <file>` + `--strict-mcp-config`.

Events (one JSON/line; `parent_tool_use_id` non-null = subagent):
```jsonc
{"type":"system","subtype":"init","session_id":"…","tools":[…],"model":"…","permissionMode":"…"}
{"type":"assistant","message":{"content":[{"type":"text","text":"…"},{"type":"tool_use","id":"…","name":"Bash","input":{…}}]}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"tok"}}}
{"type":"result","subtype":"success","is_error":false,"result":"…","num_turns":3,"duration_ms":8100,"total_cost_usd":0.041,"session_id":"…"}
```
SIGTERM aborts the turn cleanly (exit 143).

**Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) is the richer option for the Claude backend: in-process `query()` with `canUseTool` permission gate, `interrupt()`, `setModel()`, `resume`, `includePartialMessages`; spawns the CLI under the hood so message shapes match stream-json exactly — one event model shared with subprocess engines.

## 2. Codex CLI

Docs: https://developers.openai.com/codex/cli · cheatsheet: https://takopi.dev/reference/runners/codex/exec-json-cheatsheet/

```bash
codex exec --json --model gpt-5-codex --sandbox workspace-write \
  --skip-git-repo-check --cd /repo --output-last-message /tmp/last.txt "task"
codex exec resume --last --json "continue"   # or: codex exec resume <SESSION_ID>
```

Flags: `-c key=value` dotted config.toml overrides; `-a untrusted|on-failure|on-request|never`; `--full-auto`; `--output-schema <file>` (structured final message); stdin prompt via pipe. Config `~/.codex/config.toml`: `model_provider` blocks (`base_url`/`env_key`/`wire_api`) add OpenRouter/Azure/Ollama in ~6 lines; `[profiles.X]` presets; `model_reasoning_effort`.

Events:
```jsonc
{"type":"thread.started","thread_id":"…"}
{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"…","status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"final"}}
{"type":"turn.completed","usage":{"input_tokens":…,"output_tokens":…}}
// turn.failed {"error":{"message":…}}
```
Item types: `agent_message`, `reasoning`, `command_execution` (`aggregated_output`, `exit_code`), `file_change` (`changes[]` of `{path,kind}`), `mcp_tool_call`, `web_search`, `todo_list`.

## 3. Gemini CLI

Docs: https://geminicli.com/docs/cli/headless/

```bash
gemini -p "task" --output-format stream-json -m gemini-2.5-pro --approval-mode yolo
```
`--output-format text|json|stream-json`; json = single `{"response","stats","error"}` object; stream-json JSONL: `init`, `message`, `tool_use`, `tool_result`, `error`, `result`. `--approval-mode default|auto_edit|yolo|plan`. **Exit codes: 0 ok, 1 general, 42 invalid input, 53 turn limit.** JSON fidelity has had bugs — parse defensively. No headless session resume.

## 4. OpenCode

Docs: https://opencode.ai/docs/cli/ · cheatsheet: https://takopi.dev/reference/runners/opencode/stream-json-cheatsheet/

```bash
opencode run --format json -m anthropic/claude-sonnet-4-5 --auto "task"
opencode run -s <sessionID> --format json "continue"      # resume
opencode serve --port 4096   # headless HTTP server; --attach to skip cold boot
```
Events: `step_start`, `text` (`part.text`), `tool_use` (`part.tool`, `part.state.{status,input,output}`), `step_finish` (`reason:"stop"|"tool-calls"`, tokens/cost), `error`. Final answer = concat `text` parts until `step_finish` reason "stop". Config `opencode.json`: any models.dev provider + custom baseURL/apiKey with `{env:VAR}` substitution; `permission` map; `tui.json` for keybinds/theme.

## 5. Aider

```bash
aider --message "task" --yes-always --no-auto-commits file.py
```
No JSON stream — human text + git commits. Treat as fire-and-diff: parse the resulting diff, not stdout.

## 6. Cursor CLI (`agent`)

```bash
agent -p "task" --model gpt-5 --output-format stream-json --stream-partial-output --force
agent ls · agent --resume=<chatId> · agent --continue
```
`--mode plan|ask`; `--sandbox`; `--trust`; `CURSOR_API_KEY`. stream-json is broadly Claude-shaped but undocumented — snapshot-test it.

## 7. Amp

```bash
amp -x "task" --stream-json --stream-json-thinking
amp threads continue --execute "next step"
```
**Explicitly Claude-Code-compatible JSONL** (system/init, assistant/user with Anthropic content blocks incl. thinking, result with subtypes). `--stream-json-input` accepts `{"type":"user","steer":bool,"message":{…}}` for mid-run steering. `AMP_API_KEY`. An Amp adapter is nearly free once the Claude parser exists.

## 8. Copilot CLI

```bash
copilot -p "task" -s --model claude-haiku-4.5 --allow-tool 'shell(git:*)' --deny-tool 'shell(rm:*)'
```
Text-only (no JSON mode; open feature request). `--resume`/`--continue`; `COPILOT_MODEL`.

## TUI stack (npm-distributed, 2026)

**Recommendation: Ink 6.x now → Ink 7 when Node ≥22 floor is acceptable.** Ink is what Gemini CLI and Copilot CLI ship on; Claude Code forked from it. Ink 7: rewritten input handling, animation/paste/responsive-layout hooks, `wrap="hard"`, CJK/emoji fixes.

- **@inkjs/ui**: ~2 years stale (pre-Ink-6 peers) — use as pattern reference, copy what's needed, don't depend on it.
- **ink-testing-library**: `render()` + `lastFrame()` + `stdin.write()` — snapshot-test the TUI against per-backend event fixtures.
- **OpenTUI** (sst; powers OpenCode's TUI): Zig core + React bindings, kills Ink's ~30fps cap — but Bun-first and pre-1.0; only if shipping a compiled binary.
- Blessed lineage: unmaintained, skip.

**Claude Code rendering lessons** (applicable on stock Ink): keep the scrollback transcript in Ink's `<Static>` region and re-render only a small live region (spinner + streaming block + input) — the single biggest perf/flicker win for agent TUIs; frame-diff + single buffered write.

## TUI UX patterns worth stealing

- **lazygit**: same key, per-panel meaning; `?` contextual keybinding overlay; number/tab panel cycling.
- **k9s**: `:` command mode; user-definable hotkeys with live reload; header toggle for info density; skins as config files.
- **Charm/Crush**: declarative style system (adaptive light/dark, consistent padding scale) so the app reads as one design.
- **Claude Code**: Shift+Tab cycles permission modes with persistent badge; spinner line carries elapsed time + token count + "esc to interrupt"; collapsed tool calls expandable; queued follow-up messages while running.
- **Amp/OpenCode**: command palette; prompt history (Ctrl+R); completion bell/notification; keybinds+theme fully remappable.
- **Table stakes**: streaming markdown + syntax-highlighted diffs; distinct visual voice for thinking/text/tool-call/tool-result; sticky contextual footer; graceful non-TTY degradation to plain/JSON; respect `NO_COLOR`; terminal background detection.

## Sources

code.claude.com/docs/en/cli-reference · /headless · /agent-sdk/typescript · developers.openai.com/codex/cli · takopi.dev/reference/runners/{codex,opencode}/ · geminicli.com/docs/cli/headless/ · opencode.ai/docs/{cli,config}/ · aider.chat/docs/scripting.html · cursor.com/docs/cli/reference/parameters · ampcode.com/manual (+/appendix, /news/streaming-json) · docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference · github.com/vadimdemedes/ink · github.com/sst/opentui · claude-code-from-source.com/ch13-terminal-ui/ · bwplotka.dev/2025/lazygit/ · k9scli.io · charm.land
