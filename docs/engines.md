# Engine setup guide

squint drives whichever coding-agent CLI is on your PATH. Each engine authenticates its own
way — squint stores nothing. `squint doctor` shows what's installed; `squint doctor --probe`
runs a one-word prompt through every detected engine and tells you which ones actually work.

## Claude Code (`claude`) — recommended first engine

```sh
npm i -g @anthropic-ai/claude-code
claude   # first run opens the login flow (Claude subscription or API key)
```

- Fullest squint integration: token streaming, session resume, cost per turn, mode mapping
  (`plan` → `--permission-mode plan`, `safe` → `acceptEdits`, `yolo` → `bypassPermissions`).
- Model via `squint config set models.claude claude-sonnet-5` (aliases like `sonnet`, `opus` work).

## Codex CLI (`codex`)

```sh
npm i -g @openai/codex
codex login          # ChatGPT account, or: codex login --api-key <key>
```

- Session resume, sandbox-level mode mapping (`plan` → read-only, `safe` → workspace-write,
  `yolo` → danger-full-access).
- Model via `models.codex` (e.g. `gpt-5-codex`).

## Codex app-server (`codex-app`)

Same binary, different wire: drives `codex app-server` — the JSON-RPC protocol OpenAI
ships as the single backend for CLI, desktop, and IDE — through an embedded node driver
(initialize → `thread/start` or `thread/resume` → `turn/start`).

- Real streamed deltas (`item/agentMessage/delta`), tool items carrying the command
  being run, thread-id resume across turns.
- Same sandbox mapping as `codex`. Approval policy is pinned to `never` — squint's own
  loops are the review layer.
- Opt in with `/engine codex-app`; the exec adapter stays the default while the
  protocol is marked experimental upstream.

## Gemini CLI (`gemini`)

```sh
npm i -g @google/gemini-cli
gemini               # first run opens Google sign-in (or set GEMINI_API_KEY)
```

- Approval-mode mapping (`plan` / `auto_edit` / `yolo`). No headless session resume, so
  every squint ask carries the design brief.

## OpenCode (`opencode`)

```sh
npm i -g opencode-ai
opencode auth login  # pick any provider (Anthropic, OpenAI, local, …)
```

- Session resume supported. Models are addressed provider-scoped:
  `squint config set models.opencode anthropic/claude-sonnet-5`.

## Amp (`amp`)

```sh
npm i -g @ampcode/cli
export AMP_API_KEY=…   # from ampcode.com
```

- Speaks Claude's wire protocol verbatim; resume rides `amp threads continue`.

## Cursor CLI (`cursor`)

```sh
curl https://cursor.com/install -fsS | bash
agent login            # or: export CURSOR_API_KEY=…
```

- Installed as `cursor-agent` (newer builds: `agent`) — squint finds both. Plan mode maps
  to `--mode plan`; safe/yolo run with `--force`.

## Copilot CLI (`copilot`)

```sh
npm i -g @github/copilot
copilot                # authenticates with your GitHub account
```

- Text-only output (no event stream), so the transcript is plainer; still fully driven.

## Aider (`aider`)

```sh
pip install aider-install && aider-install
export ANTHROPIC_API_KEY=…   # or OPENAI_API_KEY, per aider's docs
```

- Fire-and-diff: aider prints human text and edits files; squint disables its auto-commits
  so checkpoints and `/undo` stay in charge.
- **Dormant upstream** (no release since Aug 2025): the adapter keeps working, but prefer
  an actively maintained engine for new setups.

## Verifying a setup

```sh
squint doctor            # which engines are on PATH, with install hints
squint doctor --probe    # run each installed engine end to end — auth failures
                         # surface with the CLI's own last stderr line
```

`--probe` is the honest check: a binary on PATH says nothing about whether you're
logged in. Unauthenticated engines fail fast with the actual message (e.g. cursor's
"run agent login").

## Choosing

- **Best overall with squint**: Claude Code (streaming + resume + cost + modes).
- **Already paying for ChatGPT**: Codex CLI.
- **Provider flexibility / local models**: OpenCode.
- **Watch list**: Gemini CLI is being retired for Antigravity CLI upstream — expect the
  `gemini` adapter to need migration; `codex-app` tracks the protocol OpenAI says is
  the durable surface.
- Switch any time: `/engine <id>` in the TUI, `-e <id>` on `squint run`. Per-repo default:
  `squint config set --project engine codex`.

