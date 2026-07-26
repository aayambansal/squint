# Distribution

Where squint is (or should be) listed, and how each listing works.

## Live

- **npm**: `@aayambansal/squint` — `npx @aayambansal/squint` runs the TUI;
  `npx -y @aayambansal/squint mcp` serves the gates as MCP tools.
- **GitHub Pages**: https://aayambansal.github.io/squint

## Ready to submit (account-owner steps)

Each of these needs the repo owner's account; the artifacts are prepared.

- **MCP Registry** (registry.modelcontextprotocol.io): publish under
  `io.github.aayambansal/squint` — authenticate with GitHub via the registry
  publisher CLI, point it at the npm package. The server manifest is the
  `squint mcp` command itself.
- **Claude Code plugin marketplace**: `.claude-plugin/marketplace.json` at the repo
  root makes this repo an installable marketplace
  (`/plugin marketplace add aayambansal/squint`). Submit to
  `anthropics/claude-plugins-official` and claudemarketplaces.com for the directories.
- **Terminal Trove**: submit at terminaltrove.com/new — TUI-native audience.
- **Smithery** (smithery.ai): list the MCP server; a skill listing can follow.

## The pitch, one paragraph

squint wraps any coding-agent CLI (10 engines) in a deterministic verification loop:
typecheck/lint gates, dev-server sweeps, and headless-Chrome audits that check what
agents actually break — phantom classes, invisible focus, high-contrast blindness,
truncating locales, retained DOM, dark patterns, janky frames, broken view
transitions — with element-attributed visual diffs, digest-sealed receipts, and a
detachable daemon with webhook approvals. The loop runs in a terminal, a pipeline
(`squint ci`), or as MCP tools (`squint mcp`).
