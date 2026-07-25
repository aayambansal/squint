import { Box, Text } from 'ink'
import Image from 'ink-picture'
import { useEffect, useState } from 'react'
import { Markdown } from './markdown.js'
import { supportsInlineImages } from './termImage.js'
import { useTheme } from './themeContext.js'

export interface Message {
  id: number
  role: 'user' | 'assistant' | 'status' | 'tool' | 'error' | 'thinking' | 'image'
  text: string
}

const INLINE_IMAGES = supportsInlineImages()

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const PHRASES = ['working', 'thinking', 'squinting', 'crafting', 'still at it']

export function WorkingLine({ startedAt }: { startedAt: number }) {
  const theme = useTheme()
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 80)
    return () => clearInterval(timer)
  }, [startedAt])
  const phrase = PHRASES[Math.min(Math.floor(elapsed / 8), PHRASES.length - 1)]
  return (
    <Text>
      <Text color={theme.accent}>{SPINNER_FRAMES[frame]}</Text>
      <Text color={theme.dim}>
        {' '}
        {phrase}… {elapsed}s · esc to interrupt
      </Text>
    </Text>
  )
}

/** Distinct glyph per tool family; ⚙ for the unrecognized rest. */
export function toolGlyph(text: string): string {
  const name = text.split(/[\s·]/, 1)[0]?.toLowerCase() ?? ''
  // "todo" outranks "write": TodoWrite is a todo tool, not an editor.
  if (name.includes('todo')) return '☰'
  if (name.includes('read') || name.includes('view') || name.includes('cat')) return '⊙'
  if (name.includes('edit') || name.includes('write') || name.includes('patch') || name.includes('apply')) return '✎'
  if (name.includes('bash') || name.includes('shell') || name.includes('exec') || name.includes('command')) return '$'
  if (name.includes('grep') || name.includes('glob') || name.includes('search') || name.includes('find')) return '⌕'
  if (name.includes('web') || name.includes('fetch') || name.includes('http')) return '⇣'
  if (name.includes('task') || name.includes('agent')) return '◇'
  return '⚙'
}

export function MessageLine({ message }: { message: Message }) {
  const theme = useTheme()
  switch (message.role) {
    case 'user':
      return (
        <Text color={theme.user} wrap="wrap">
          ❯ {message.text}
        </Text>
      )
    case 'assistant':
      return <Markdown text={message.text} />
    case 'status':
      return (
        <Text color={theme.dim} wrap="wrap">
          · {message.text}
        </Text>
      )
    case 'tool':
      return (
        <Text color={theme.tool} wrap="wrap">
          {toolGlyph(message.text)} {message.text}
        </Text>
      )
    case 'thinking':
      return (
        <Text color={theme.dim} italic wrap="wrap">
          {message.text}
        </Text>
      )
    case 'error':
      return (
        <Text color={theme.error} wrap="wrap">
          ✗ {message.text}
        </Text>
      )
    case 'image':
      // Real pixels where the terminal can (kitty/iTerm2 family);
      // elsewhere just the path — ASCII screenshots are noise.
      if (!INLINE_IMAGES) {
        return (
          <Text color={theme.dim} wrap="wrap">
            ▣ {message.text}
          </Text>
        )
      }
      return (
        <Box flexDirection="column">
          <Image src={message.text} width={48} height={14} alt="screenshot" />
          <Text color={theme.dim}>▣ {message.text}</Text>
        </Box>
      )
  }
}
