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
`createClaudeStreamParser` and you're nearly done.

## Other prize contributions

- **A flow verb** (src/preview/flows.ts): the declared-flow language is six verbs today; hover, scroll, and waitFor are natural next ones — parser case + in-page executor + fixture test.
- **An aesthetic family** (src/prompt/families.ts): a committed direction with a real avoid-list, not a vibe.
- **A slop tell** (SLOP_AUDIT in src/preview/cdp.ts): deterministic, checkable, with a fixture.
- **A hook event** (src/session/hooks.ts): find the quality moment nothing else emits.

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
