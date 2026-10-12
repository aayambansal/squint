# Product

## Register

brand

## Users

Developers who already live in a terminal and already use a coding agent (Claude Code, Codex, Cursor). They found squint through GitHub, npm, or a link from a friend. Context: deciding in about a minute whether this tool is worth an `npx`. The job: understand what squint does, see a real result, copy one command.

## Product Purpose

squint is a free, open-source terminal tool that checks the page a coding agent just built: types and lint, the dev server's output, then the page itself in headless Chrome, with the findings handed back to the agent. It is one person's project and it exists to be useful. The landing page tells people plainly what it does, shows one run they can check for themselves, says what it will not do, and hands over the install command. Success: a visitor can tell quickly whether it would help them.

## Brand Personality

Plainspoken and honest. Nothing is being sold. The page reads like its author explaining the tool to another developer: what it is, what it found on a real page, what you need, where it falls short.

## Anti-references

- A product launch page for a free tool: slogans, feature grids, staged terminal replays, pricing mocks, comparison tables.
- The dark "developer tool" landing page: black background, neon glow, purple gradients, mono everywhere.
- The SaaS template: centered hero + badge + three icon cards + stat banner.
- Editorial-serif affectation (italic display serif, ruled columns) on a tool that is not a magazine.
- Everything in docs/research/frontend-quality.md's AI-slop tell catalog. The repo documents these tells; the landing page must contain none.

## Design Principles

- Say what it is. Plain sentences, no slogans. A claim that cannot be checked gets cut.
- Real output only. Every finding quoted on the page came from running the published squint against `landing/specimen/`, a page with nine marked mistakes. When the checks or the specimen change, run it again and update the page to match.
- The limits are part of the page. "What it won't do" is a section, not small print.
- One image: the eye chart. Problems on a page, ordered by how easy they are to see, in type that shrinks line by line. It is black on white with the chart's red and green bars as the only color, and it stays a lit white panel in both the light and the dark theme.
- Set in Atkinson Hyperlegible, served from the site. The page makes no third-party requests.
- The drawings beside each finding are plain line art with a red pen mark on the mistake.

## Accessibility & Inclusion

WCAG 2.1 AA. Body contrast well above 4.5:1 in both themes, visible keyboard focus, real alt text and labels, semantic landmarks. The chart coming into focus on load is decoration: reduced-motion users get it sharp from the start, and nothing is hidden without JavaScript. The page should pass `squint ci --url` with no hard findings.
