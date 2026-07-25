# Configuration

Two layers, project wins over global, `models` maps merge key-by-key:

- **Global**: `~/.config/squint/config.json` (XDG-aware)
- **Project**: `.squint/config.json` — set with `squint config set --project <key> <value>`

`squint config get` prints the resolved result. `squint config path` shows both locations.

## Keys

| key | type | default | what it does |
| --- | --- | --- | --- |
| `engine` | string | `claude` | default engine id (`squint engines` lists them) |
| `models.<engineId>` | string | engine default | per-engine model, e.g. `models.claude claude-sonnet-5`, `models.opencode anthropic/claude-sonnet-5` |
| `theme` | string | `amber` (auto-`light` on light terminals) | `amber` · `ocean` · `moss` · `rose` · `light` · `mono` |
| `autoDev` | bool | `false` | start the project dev server when the TUI opens |
| `autoFix` | bool | `false` | send open problems back to the engine automatically, max 2 attempts per ask |
| `autoCheck` | bool | `true` | run typecheck + lint after every turn |
| `autoProbe` | bool | `true` | load the page headlessly after clean turns (runtime errors + visual pulse) |
| `autoReview` | bool | `false` | when the visual pulse shows 10%+ change after a clean turn, run the self-critique review automatically (once per ask) |
| `bell` | bool | `true` | terminal bell when a turn finishes |
| `budgetUsd` | number | off | one-time warning when session spend crosses this |
| `fixModel` | string | session model | cheaper model used for auto-fix and `/fix` turns |

Booleans are set as literal `true` / `false`:

```sh
squint config set autoFix true
squint config set --project engine codex
squint config set budgetUsd 5
```

## Project files under `.squint/`

Hand-authored (commit these):

| file | purpose |
| --- | --- |
| `brief.md` | replaces the design brief for this repo (`squint brief <family>` writes one) |
| `rules.md` | short always-on rules, injected into every ask |
| `skills/*.md` | knowledge injected only when an ask mentions a `triggers:` keyword |
| `locks` | one path per line the engine must never modify |
| `hooks/` | executables fired on quality events (see [loops](./loops.md#hooks)) |
| `routes` | one path per line; `/shot` and `/review` cover them beyond the root |
| `flows/` | declared user journeys replayed by `/flows` (see [loops](./loops.md#flows-and-the-score)) |
| `config.json` | the project config layer |
| `design-log.jsonl` | the design-decision ledger, appended by `/decide`, variants, restores, sandboxes (see [loops](./loops.md#the-design-ledger)) |

Working files (auto-gitignored by squint): `preview/` (screenshots), `state.json`
(session resume), `variants/` (exploration worktrees), `sandbox/` (the /sandbox worktree),
`transcripts/` (`/save` exports).

## Environment

- `NO_COLOR` — forces the mono theme.
- API keys are never read or stored by squint; each engine CLI handles its own auth
  (see [docs/engines.md](./engines.md)).
