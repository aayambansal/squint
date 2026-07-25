/**
 * The command registry: one source of truth powering /help, the TUI's
 * live slash completion, and anything else that needs to know what
 * commands exist (the opencode single-registry insight, minimal form).
 */
export interface CommandSpec {
  name: string
  args?: string
  description: string
  /** Handled by the view layer, not the session core. */
  viewLevel?: boolean
}

export const COMMANDS: CommandSpec[] = [
  { name: 'dev', description: 'start/stop the project dev server' },
  { name: 'check', description: 'run all quality gates (typecheck, lint, test, build)' },
  { name: 'problems', description: 'list open findings from gates, dev server, runtime, a11y' },
  { name: 'fix', args: '[n]', description: 'send all open problems to the engine, or just problem n' },
  { name: 'shot', description: 'screenshot the app at mobile/tablet/desktop' },
  { name: 'review', args: '[focus]', description: 'screenshots + the engine critiques its own rendered work' },
  { name: 'variants', args: '<2-4> <ask>', description: 'parallel design explorations; apply/list/clean' },
  { name: 'undo', description: 'revert the last ask (files only)' },
  { name: 'checkpoints', description: 'list per-ask checkpoints' },
  { name: 'restore', args: '<n>', description: 'rewind files to before ask n' },
  { name: 'mode', args: 'plan|safe|yolo', description: 'how much the engine may do (shift+tab cycles)' },
  { name: 'engine', args: '<id>', description: 'switch backend (new session)' },
  { name: 'engines', description: 'list installed engines with streaming/resume support' },
  { name: 'model', args: '[name]', description: 'model override for the engine' },
  { name: 'theme', args: '[name]', description: 'switch the TUI theme', viewLevel: true },
  { name: 'copy', description: 'copy the last reply to the clipboard' },
  { name: 'save', description: 'export the transcript to .squint/transcripts/' },
  { name: 'queue', args: 'clear', description: 'drop queued asks' },
  { name: 'resume', description: 'pick up the previous session for this repo' },
  { name: 'clear', description: 'new session (transcript, totals, persisted state)' },
  { name: 'help', description: 'list commands' },
  { name: 'quit', description: 'exit with a session summary' },
]

/** Commands whose names start with the given partial (no leading /). */
export function completeCommand(partial: string): CommandSpec[] {
  const query = partial.toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(query))
}

export function commandHelp(): string {
  return COMMANDS.map((c) => `/${c.name}${c.args ? ` ${c.args}` : ''} — ${c.description}`).join('\n')
}
