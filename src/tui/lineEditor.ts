/**
 * Pure single-line editor state: the input line as {text, cursor} plus
 * every edit operation as a pure function. The Ink layer maps keys to
 * these and renders the result; all editing behavior is testable here.
 */
export interface Line {
  text: string
  cursor: number
}

export const emptyLine: Line = { text: '', cursor: 0 }

export function fromText(text: string): Line {
  return { text, cursor: text.length }
}

/** Insert a string (single keystroke or a paste) at the cursor. */
export function insert(line: Line, str: string): Line {
  const clean = str.replace(/\r/g, '').replace(/\n+/g, ' ')
  return {
    text: line.text.slice(0, line.cursor) + clean + line.text.slice(line.cursor),
    cursor: line.cursor + clean.length,
  }
}

export function backspace(line: Line): Line {
  if (line.cursor === 0) return line
  return {
    text: line.text.slice(0, line.cursor - 1) + line.text.slice(line.cursor),
    cursor: line.cursor - 1,
  }
}

export function left(line: Line): Line {
  return { ...line, cursor: Math.max(0, line.cursor - 1) }
}

export function right(line: Line): Line {
  return { ...line, cursor: Math.min(line.text.length, line.cursor + 1) }
}

export function home(line: Line): Line {
  return { ...line, cursor: 0 }
}

export function end(line: Line): Line {
  return { ...line, cursor: line.text.length }
}

const isWordChar = (ch: string) => /[\p{L}\p{N}_/@.-]/u.test(ch)

/** Jump to the start of the current or previous word. */
export function wordLeft(line: Line): Line {
  let i = line.cursor
  while (i > 0 && !isWordChar(line.text[i - 1]!)) i--
  while (i > 0 && isWordChar(line.text[i - 1]!)) i--
  return { ...line, cursor: i }
}

/** Jump past the end of the current or next word. */
export function wordRight(line: Line): Line {
  let i = line.cursor
  const n = line.text.length
  while (i < n && !isWordChar(line.text[i]!)) i++
  while (i < n && isWordChar(line.text[i]!)) i++
  return { ...line, cursor: i }
}

/** Ctrl+K: delete from cursor to end of line. */
export function killToEnd(line: Line): Line {
  return { text: line.text.slice(0, line.cursor), cursor: line.cursor }
}

/** Ctrl+U: delete from start of line to cursor. */
export function killToStart(line: Line): Line {
  return { text: line.text.slice(line.cursor), cursor: 0 }
}

/** Ctrl+W: delete the word before the cursor. */
export function killWordBack(line: Line): Line {
  const target = wordLeft(line).cursor
  return {
    text: line.text.slice(0, target) + line.text.slice(line.cursor),
    cursor: target,
  }
}
