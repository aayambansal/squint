/**
 * Build/compile error detection across the common dev-server vocabularies
 * (Vite, esbuild, webpack, Next, tsc). Deliberately pattern-based: squint
 * only needs to know that something broke and capture the surrounding text —
 * the engine does the actual diagnosis.
 */
const ERROR_SIGNATURES = [
  /\berror\b.*\bTS\d+/i, // tsc: error TS2304
  /✘ \[ERROR\]/, // esbuild
  /\[vite\].*error/i,
  /Internal server error/i,
  /Failed to compile/i, // webpack / next
  /Module not found/i,
  /Cannot find module/i,
  /SyntaxError:/,
  /ReferenceError:/,
  /TypeError:/,
  /Unhandled Rejection/i,
  /^error\b/i, // generic leading "error:"
  /\bERROR\b/,
]

/** Lines that match error vocabulary but are routine noise. */
const FALSE_POSITIVES = [
  /0 errors?/i,
  /no errors?/i,
  /error-free/i,
  /warnings? and 0/i,
]

export function isErrorLine(line: string): boolean {
  if (FALSE_POSITIVES.some((re) => re.test(line))) return false
  return ERROR_SIGNATURES.some((re) => re.test(line))
}

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+[^\s]*)/

/** Pull the first local URL a dev server announces (Vite's "Local:" line etc). */
export function extractUrl(line: string): string | null {
  const match = URL_RE.exec(line)
  if (!match || !match[1]) return null
  // Strip ANSI escapes and trailing punctuation that regexes drag along.
  return match[1].replace(/\[[0-9;]*m/g, '').replace(/[.,)\]']+$/, '')
}
