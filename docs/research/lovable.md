# How Lovable works under the hood

Research snapshot (2026-07-25) for building squint's harness loop. Sources at the end. Leaked prompts are community-captured snapshots (Sept 2025 era); Lovable iterates weekly.

## TL;DR blueprint

Lovable = **one locked template** (Vite + React 18 + TS + Tailwind + shadcn/ui) + **one main agent** (Claude, ~25 tools, single loop, no multi-agent) + **a design-system-first prompt** + **an instrumented preview** (Vite plugin maps DOM→JSX source; injected script streams console/network back) + **error feedback as a free "Try to fix" re-prompt with logs** + **Supabase as the only backend**. Speed and constraint-narrowing are the core design decisions.

## The leaked Agent-mode system prompt (2025-09-16)

Full text: https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Lovable

Rules worth adopting verbatim:

- Identity + environment framing: the prompt literally describes the product UI ("chat window on the left… live preview iframe on the right… users will see updates immediately").
- Hard stack lock: React/Vite/Tailwind/TS only; "not possible" to support other frameworks.
- "PERFECT ARCHITECTURE: … Spaghetti code is your enemy."
- "MAXIMIZE EFFICIENCY: always invoke all relevant tools simultaneously."
- "NEVER READ FILES ALREADY IN CONTEXT" — a per-turn `useful-context` block carries retrieved files; the prompt polices redundant reads (appears 4+ times).
- "BE CONCISE: fewer than 2 lines of text (not including tool use or code generation)."
- "DEFAULT TO DISCUSSION MODE… only implement on explicit action words ('implement', 'code', 'create', 'add')."
- Debugging: ALWAYS use debugging tools first (read-console-logs, read-network-requests) before touching code.
- Pitfalls list: overengineering, scope creep, monolithic files, "DOING TOO MUCH AT ONCE: make small, verifiable changes instead of large rewrites."
- Assumes non-technical users: never tell users to edit files or paste logs — the agent does it.
- Built-in SEO checklist per page (title <60 chars, meta ≤160, single H1, semantic HTML, alt text, JSON-LD, lazy loading, canonical).

### Design-system doctrine (the anti-generic-look core)

- "CRITICAL: The design system is everything. You should never write custom styles in components… never use classes like text-white, bg-white. You always use the design system tokens."
- "Leverage index.css and tailwind.config.ts to create a consistent design system… Create variants in the components. Shadcn components are made to be customized!"
- "ALWAYS use HSL colors." Example tokens: `--primary`, `--primary-glow`, `--gradient-primary`, `--shadow-elegant`, `--transition-smooth`.
- Dark/light-mode pitfall inoculation ("you often make mistakes having white text on white background").

### First-message conditional block (turn 1 only)

- "Make sure to wow them with a really, really beautiful and well coded app! Otherwise you'll feel bad."
- Inverts discussion default: first message → just build.
- Prescribed sequence: think → describe what the request evokes + design inspiration → scoped v1 feature list → colors/gradients/animations/fonts → **edit tokens (tailwind.config.ts + index.css) FIRST** → build components in new files → generate images for placeholders.
- "Never implement a light/dark mode switch — not a priority." / "WRITE FILES AS FAST AS POSSIBLE — use search-replace, not full rewrites."

## Tool inventory (from leaked Agent Tools.json)

| Category | Tools |
|---|---|
| Files | `lov-view` (first 500 lines default), `lov-write` (new files/full rewrites only), **`lov-line-replace`** (primary editor: search+replace validated against explicit 1-indexed line ranges; `...` ellipsis for >6-line spans), `lov-rename`, `lov-delete`, `lov-copy` |
| Search | `lov-search-files` (regex + globs) |
| Deps | `lov-add-dependency` / `lov-remove-dependency` (package.json otherwise off-limits) |
| Debug | `lov-read-console-logs`, `lov-read-network-requests` (snapshot semantics: "do not expect to verify a fix by reading logs again") |
| Web | web search, `lov-fetch-website` (markdown/html/screenshot), `lov-download-to-repo` |
| Images | generate_image (flux.schnell default; hero → flux.dev; ES6-import the results), edit_image |
| Backend | Supabase docs search/get, security scan (RLS coverage), table schema |
| Secrets | add/update secret — value collected via secure form, never in chat |

Notable absences: **no shell, no test runner, no git tool**. Loop is purely edit files → hosted dev server rebuilds → errors come back through dedicated read tools.

## The older single-shot protocol (May 2025) — simpler to replicate first

Source: https://github.com/YeeKal/leaked-system-prompts/blob/main/prompts/lovable/lovable-20250516.md

- One response = one `<lov-code>` XML block wrapping ALL file operations, preceded by a step-by-step outline, followed by a one-sentence non-technical summary.
- **Truncation contract**: `// ... keep existing code` must appear exactly — "a regex will look for this specific pattern" and splices unchanged sections server-side.
- Whole template inlined in the prompt under `<current-code>`; shadcn `src/components/ui/*` and configs marked forbidden.
- Per-turn context tags: `<useful-context>`, `<console-logs>`, `<current-route>`, `<last-diff>`, `<instructions-reminder>`.
- **Error-bubbling rule**: "Don't catch errors with try/catch unless requested… errors should bubble back to you so you can fix them." + "Write extensive console logs."
- Component discipline: new file per component/hook regardless of size; target ≤50 lines; auto-nag when a file exceeds ~100–200 lines.
- Known-failure inoculation: common lucide-react TS errors, unescaped-apostrophe JSX bug embedded in context.
- State detection: check whether the request is already implemented before editing.

## Template (exact): `vite_react_shadcn_ts`

- Scripts: `dev: vite`, `build: vite build`, `build:dev: vite build --mode development`, `preview: vite preview`
- Deps: react 18.3, react-router-dom ^6, @tanstack/react-query ^5, react-hook-form + zod, all ~28 radix packages, cva + clsx + tailwind-merge + tailwindcss-animate, lucide-react, recharts, sonner, vaul, cmdk, embla, date-fns, next-themes
- DevDeps: vite ^5 + @vitejs/plugin-react-swc, TS ^5.5, tailwind ^3.4, eslint 9 (with `no-unused-vars: off`!), and **`lovable-tagger`**
- index.html carries an injected preview-runtime script that captures console/network/errors/element-picks in the iframe and posts them to the parent.

### lovable-tagger internals (v1.3.3) — enables "select element → edit"

- Vite plugin that **aliases `react/jsx-dev-runtime`** to its own module; its `jsxDEV` wrapper injects a ref callback stamping every real DOM node with `{fileName, lineNumber, columnNumber, displayName}` under a symbol, registered in `window.sourceElementMap` keyed `"file:line:col"` (WeakRef sets).
- Click any element in the preview → exact source file/line/col + component name → precise edit context (or direct AST patch for pure style/text edits).
- Also extracts the resolved Tailwind theme (v3 `resolveConfig`, v4 CSS `@theme` parsing) to `src/tailwind.config.lov.json` so visual-edit pickers offer real tokens.

## Product mechanics

- **Modes**: Agent (default; autonomous loop, visible task list, prompt queue up to 50), Chat (agentic but read-only — plan/debug), Plan mode. Old Edit mode = the single-shot XML protocol.
- **Preview**: hosted Vite dev server per project (Modal sandboxes; 20k concurrent at peak) with HMR into the iframe. Publish = static build.
- **"Try to fix" is free** (no credits): a canned re-prompt with captured error context. Product decision: users shouldn't pay for the tool's mistakes.
- **Preview toolbar** (2026): select element + describe (normal credits), inline text edit (no AI, free), draw annotation → prompt, comment threads. Pure style/text edits bypass the LLM via tagger source map + AST.
- **Supabase**: agent writes SQL migrations → shown → **user approves in chat** → applied, TS types regenerated; edge functions auto-deployed; failed function → agent reads its logs; security scan gates publish.
- Every message = restorable version (git commit under the hood); two-way GitHub sync.

## Team engineering insights

- **Abandoned multi-agent** (Devin-style): "lower accuracy than simpler approaches", users couldn't understand failures. Rule: fast + legible. (Subagents returned later only on top of the working single loop.)
- **Model tiering ("hydration")**: small fast model prepares context/selects files → one big model call (Claude Sonnet-class) writes code. "Speed is perhaps the most important factor in the UX."
- **Context management**: never feed the whole repo — an LLM pre-pass picks relevant files into `useful-context`.
- **Prompt process**: start minimal, add only when necessary; every prompt change **back-tested against a library of real past queries** before deploy.
- Scope honesty: targets ~80% of apps (CRUD SaaS, dashboards, auth+per-user data); escape hatch = full code export.

## Contrast: v0 / Bolt / Replit — rules worth stealing

- **Bolt**: install deps FIRST; don't re-run a dev server on file updates; migration files always start with a plain-English summary comment; FORBIDDEN destructive SQL; "Do NOT be verbose."
- **v0**: hard design numbers — exactly 3–5 colors total; max 2 font families; **never purple/violet prominently unless asked**; avoid gradients entirely unless asked; never emoji as icons; mobile-first; real backend by default (never localStorage persistence unless asked); a dedicated design-brief generation step before UI work; `[v0]`-prefixed debug logs + virtual log file with staleness warnings.
- **Replit**: multi-agent on LangGraph (manager/editor/verifier), smallest-possible-task per agent; verifier talks to the user.

## Sources

- Agent prompt + tools: https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Lovable
- 2025-05 prompt + template: https://github.com/YeeKal/leaked-system-prompts/blob/main/prompts/lovable/lovable-20250516.md
- lovable-tagger: https://unpkg.com/lovable-tagger@1.3.3/dist/index.js
- Docs: https://docs.lovable.dev (agent-mode, troubleshooting, supabase, visual-edit)
- Team interview: https://www.zenml.io/llmops-database/building-an-ai-powered-software-development-platform-with-multiple-llm-integration
- Infra: https://modal.com/blog/lovable-case-study · Case study: https://claude.com/customers/lovable
- Replit agents: https://www.langchain.com/breakoutagents/replit
