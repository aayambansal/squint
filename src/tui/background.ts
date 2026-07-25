/**
 * Terminal background detection via OSC 11: query the terminal for its
 * background color, parse the rgb reply, and classify light vs dark.
 * Used to pick readable theme variants automatically — only when the
 * user hasn't chosen a theme themselves (the gemini-cli rule).
 */
export type Background = 'dark' | 'light' | 'unknown'

export function parseOsc11(reply: string): Background {
  // Replies look like: ESC]11;rgb:1e1e/2020/2b2b BEL (or ST terminator).
  const match = /rgb:([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})/.exec(reply)
  if (!match) return 'unknown'
  // Scale each channel to 0-255 regardless of reply precision.
  const channel = (hex: string) => Number.parseInt(hex.slice(0, 2), 16)
  const [r, g, b] = [channel(match[1]!), channel(match[2]!), channel(match[3]!)]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 140 ? 'light' : 'dark'
}

/** Ask the terminal for its background; resolves 'unknown' on timeout. */
export function detectBackground(timeoutMs = 300): Promise<Background> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY || !stdout.isTTY) return resolve('unknown')

    let buffer = ''
    const finish = (result: Background) => {
      clearTimeout(timer)
      stdin.off('data', onData)
      resolve(result)
    }
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      if (buffer.includes('rgb:')) {
        // Wait for the terminator implicitly; the regex needs channels only.
        const parsed = parseOsc11(buffer)
        if (parsed !== 'unknown') finish(parsed)
      }
    }
    const timer = setTimeout(() => finish('unknown'), timeoutMs)
    stdin.on('data', onData)
    try {
      stdout.write('\x1b]11;?\x07')
    } catch {
      finish('unknown')
    }
  })
}
