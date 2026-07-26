# Contributing to squint

Thanks for looking at this. squint moves fast and stays small — the whole product is a few
thousand lines of strict TypeScript with zero runtime dependencies beyond Ink, Commander,
Zod, and picocolors. Keep it that way.

## Setup

```sh
git clone https://github.com/aayambansal/squint.git
cd squint
npm install
npm run check        # typecheck + tests + build — must be green before and after your change
```

Run your working copy:

```sh
npm run build && node dist/cli.js doctor
# or: npm link  → `squint` everywhere
```

Node ≥ 22. Chrome-dependent
tests skip when no Chrome/Chromium is found.

## Workflow

- Branch → PR → squash-merge. CI (typecheck, tests, build) must pass.
- One change per PR. Small PRs merge fast here.
- Say what you verified in the PR body — command and result, not "should work".

## The prize contribution: an engine adapter

Every coding-agent CLI is an engine, and an engine is ~80 lines. Look at
`src/engines/opencode.ts` (stateful JSON parser) or `src/engines/copilot.ts` (plain-text
backend) for the two shapes. The contract (`src/engines/types.ts`):

1. `buildArgs(opts)` — the headless invocation: prompt, model, session resume.
2. `createParser()` — optional; translate one stdout line into normalized `AgentEvent`s
   (`status | delta | text | thinking | tool | result | error | raw`). Plain-text tools
   skip this entirely.
3. Register it in `src/engines/registry.ts`, add fixture-based tests in `test/` (paste real
   output lines from the tool as fixtures — see `test/codex.test.ts`).

If the tool speaks the Claude stream-json dialect (Amp does, Cursor approximately), reuse
`createClaudeStreamParser` and you're nearly done. If it publishes a request/response
protocol instead of a text stream, see `src/engines/codexApp.ts` — an embedded node
driver owns the protocol child and re-emits normalized JSONL (the runner only pipes
stdout, so the driver is the escape hatch).

## Other prize contributions

- **A flow verb** (src/preview/flows.ts): nine verbs today (goto/click/fill/press/expect/shot/hover/scroll/wait) — parser case + in-page executor + fixture test.
- **An audit** (src/preview/cdp.ts): the pattern is proven eight times over — A11Y, SLOP, PHANTOM, VT, FIBER, WEBMCP, LoAF, keyboard journey. Deterministic, in-page, capped output, live-Chrome fixture. Bring the ninth.
- **A rule-pack** (src/quality/rulepacks.ts): version-aware lint of the turn's diff against a toolchain major — hard renames become fix prompts, shifted meanings become advisories.
- **A sentinel pattern** (src/quality/sentinel.ts): a gate-evasion behavior we don't catch yet, with a fixture proving honest work stays silent.
- **An aesthetic family** (src/prompt/families.ts): a committed direction with a real avoid-list, not a vibe.
- **A hook event** (src/session/hooks.ts): five today (turn-end, pulse-diff, problem, budget, sentinel) — find the quality moment nothing else emits.
- **An MCP tool** (src/mcp/server.ts): four gates are served today; anything deterministic squint measures is a candidate.

## Testing philosophy

Tests here run the real thing: real temp git repos, real spawned processes, real headless
Chrome, real Vite dev servers. Mock nothing you can run. Gate environment-dependent suites
with `describe.skipIf(...)` so `npm run check` is green on any machine.

## Style

- Strict TS, ESM, no default exports (the CLI entry excepted).
- Comments state constraints the code can't show — never narrate the next line.
- Errors surface with the fix in the message (`not found on PATH. Install it: …`).
- The design brief and family content live in `src/prompt/` — changes there should cite
  the research in `docs/research/` rather than taste alone.
