/**
 * Taskbar progress via OSC 9;4 (ConEmu's sequence, adopted by WezTerm,
 * iTerm2 3.7, Ghostty, Windows Terminal): a long audit or CI run drives
 * the terminal's own progress indicator instead of guessing in the
 * dark. Silent no-op where unsupported — it is an escape sequence
 * terminals that don't understand simply ignore.
 *
 * state 1 = normal (0-100), 2 = error, 3 = indeterminate, 0 = clear.
 */
export type ProgressState = 'normal' | 'error' | 'indeterminate' | 'clear'

const STATE_CODE: Record<ProgressState, number> = {
  normal: 1,
  error: 2,
  indeterminate: 3,
  clear: 0,
}

/** Emit an OSC 9;4 sequence; TTY-gated and honoring NO_COLOR. */
export function setProgress(
  state: ProgressState,
  percent = 0,
  stream: NodeJS.WriteStream = process.stdout,
): void {
  if (!stream.isTTY || process.env.NO_COLOR || process.env.SQUINT_NO_PROGRESS) return
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  stream.write(`\x1b]9;4;${STATE_CODE[state]};${pct}\x07`)
}

/** Run work with an indeterminate progress indicator, always cleared. */
export async function withProgress<T>(work: () => Promise<T>, stream?: NodeJS.WriteStream): Promise<T> {
  setProgress('indeterminate', 0, stream)
  try {
    return await work()
  } finally {
    setProgress('clear', 0, stream)
  }
}
