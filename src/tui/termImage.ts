/**
 * Can this terminal render real inline images? Env-based detection for
 * the protocols ink-picture speaks natively (kitty APC, iTerm2 OSC
 * 1337). Under tmux or unknown terminals we skip images entirely —
 * an ASCII-art screenshot in the transcript is noise, not signal.
 */
export function supportsInlineImages(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TMUX) return false
  if (env.TERM === 'xterm-kitty' || env.KITTY_WINDOW_ID) return true
  if (env.TERM === 'xterm-ghostty' || env.GHOSTTY_RESOURCES_DIR) return true
  if (env.TERM_PROGRAM === 'WezTerm') return true
  if (env.TERM_PROGRAM === 'iTerm.app') return true
  return false
}
