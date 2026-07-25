# Security Policy

squint spawns agent CLIs, dev servers, and headless Chrome on your machine, and applies
git patches — bugs here can matter. If you find a vulnerability:

- **Do not open a public issue.**
- Use GitHub's private reporting: [Report a vulnerability](https://github.com/aayambansal/squint/security/advisories/new),
  with a description and reproduction. You'll get a reply within a few days. If you can't
  use that, email me — contact details are on [my GitHub profile](https://github.com/aayambansal).

## Scope worth probing

- Command construction in engine adapters (`src/engines/*`) — prompts are passed as argv
  arrays, never through a shell; anything that breaks that assumption is a bug.
- The variant patch flow (`git apply` of worktree diffs) and `/undo` restore paths.
- The tagger plugin (`squint-tagger.mjs`) — dev-only by design (`apply: 'serve'`); anything
  that lets it reach a production build is a bug.
- The temporary npm/config handling — squint must never write credentials into a repo.

Only the latest release is supported with fixes.
