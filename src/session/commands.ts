/**
 * The command registry: one source of truth powering /help, the TUI's
 * live slash completion, and anything else that needs to know what
 * commands exist (the opencode single-registry insight, minimal form).
 */
export type CommandGroup = 'build' | 'verify' | 'explore' | 'session'

export interface CommandSpec {
  name: string
  args?: string
  description: string
  group: CommandGroup
  /** Handled by the view layer, not the session core. */
  viewLevel?: boolean
}

export const COMMANDS: CommandSpec[] = [
  { name: 'dev', args: '[restart|logs]', group: 'build', description: 'start/stop the dev server; restart or show recent output' },
  { name: 'mode', args: 'plan|safe|yolo', group: 'build', description: 'how much the engine may do (shift+tab cycles)' },
  { name: 'engine', args: '<id>', group: 'build', description: 'switch backend (new session)' },
  { name: 'engines', group: 'build', description: 'list installed engines with streaming/resume support' },
  { name: 'model', args: '[name]', group: 'build', description: 'model override for the engine' },
  { name: 'queue', args: 'clear|drop <n>', group: 'build', description: 'clear the queue or drop one queued ask' },

  { name: 'check', group: 'verify', description: 'run all quality gates (typecheck, lint, format, test, build)' },
  { name: 'problems', group: 'verify', description: 'list open findings from gates, dev server, runtime, a11y' },
  { name: 'fix', args: '[n]', group: 'verify', description: 'send all open problems to the engine, or just problem n' },
  { name: 'shot', args: '[url]', group: 'verify', description: 'screenshot the app (or any url) at mobile/tablet/desktop' },
  { name: 'review', args: '[focus]', group: 'verify', description: 'screenshots + the engine critiques its own rendered work' },
  { name: 'polish', args: '[1-5]', group: 'verify', description: 'unattended rounds of review → fix (default 2)' },
  { name: 'score', group: 'verify', description: 'deterministic quality snapshot (problems, a11y, tells, runtime, LCP)' },
  { name: 'flows', args: '[name]', group: 'verify', description: 'replay declared .squint/flows/ journeys headlessly' },

  { name: 'variants', args: '<2-4> <ask>', group: 'explore', description: 'parallel design explorations; apply/list/clean' },
  { name: 'sandbox', args: '[on|diff|apply|discard]', group: 'explore', description: 'asks accumulate in a shadow worktree until you apply' },
  { name: 'undo', group: 'explore', description: 'revert the last ask (files only)' },
  { name: 'checkpoints', group: 'explore', description: 'list per-ask checkpoints' },
  { name: 'restore', args: '<n>', group: 'explore', description: 'rewind files to before ask n' },

  { name: 'theme', args: '[name]', group: 'session', description: 'switch the TUI theme', viewLevel: true },
  { name: 'btw', args: '<question>', group: 'session', description: 'read-only side question; the main thread is untouched' },
  { name: 'copy', group: 'session', description: 'copy the last reply to the clipboard' },
  { name: 'save', group: 'session', description: 'export the transcript to .squint/transcripts/' },
  { name: 'find', args: '<term>', group: 'session', description: 'search this session and saved transcripts' },
  { name: 'decide', args: '<text>', group: 'session', description: 'record a design decision; injected into every future ask' },
  { name: 'goal', args: '[text|off]', group: 'build', description: 'arm a standing objective; auto-fix presses until checks are clean' },
  { name: 'distill', group: 'session', description: 'compress the design ledger into rules.md lines and proposed checks' },
  { name: 'context', group: 'session', description: 'what squint injects per ask, token-costed, with staleness warnings' },
  { name: 'yes', args: '[note]', group: 'build', description: "approve the engine's pending visual-approval request" },
  { name: 'no', args: '[note]', group: 'build', description: "reject the engine's pending visual-approval request" },
  { name: 'resume', group: 'session', description: 'pick up the previous session for this repo' },
  { name: 'clear', group: 'session', description: 'new session (transcript, totals, persisted state)' },
  { name: 'help', group: 'session', description: 'list commands' },
  { name: 'quit', group: 'session', description: 'exit with a session summary' },
]

/** Commands whose names start with the given partial (no leading /). */
export function completeCommand(partial: string): CommandSpec[] {
  const query = partial.toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(query))
}

const GROUP_TITLES: Record<CommandGroup, string> = {
  build: 'build',
  verify: 'verify',
  explore: 'explore & rewind',
  session: 'session',
}

export function commandHelp(): string {
  const sections: string[] = []
  for (const group of ['build', 'verify', 'explore', 'session'] as CommandGroup[]) {
    const rows = COMMANDS.filter((c) => c.group === group).map(
      (c) => `  /${c.name}${c.args ? ` ${c.args}` : ''} — ${c.description}`,
    )
    sections.push(`${GROUP_TITLES[group]}\n${rows.join('\n')}`)
  }
  return sections.join('\n')
}
