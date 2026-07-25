/**
 * Incremental line splitter for child-process stdout. Handles chunks that
 * split mid-line and flushes any trailing partial line at stream end.
 */
export interface LineSplitter {
  push(chunk: string): void
  flush(): void
}

export function lineSplitter(onLine: (line: string) => void): LineSplitter {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (line.trim().length > 0) onLine(line)
      }
    },
    flush() {
      if (buffer.trim().length > 0) onLine(buffer)
      buffer = ''
    },
  }
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}
