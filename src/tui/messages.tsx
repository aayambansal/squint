import { Text } from 'ink'
import { useEffect, useState } from 'react'
import { theme } from './theme.js'

export interface Message {
  id: number
  role: 'user' | 'assistant' | 'status' | 'tool' | 'error' | 'thinking'
  text: string
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function WorkingLine({ startedAt }: { startedAt: number }) {
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 80)
    return () => clearInterval(timer)
  }, [startedAt])
  return (
    <Text>
      <Text color={theme.accent}>{SPINNER_FRAMES[frame]}</Text>
      <Text color={theme.dim}>
        {' '}
        working… {elapsed}s · esc to interrupt
      </Text>
    </Text>
  )
}

export function MessageLine({ message }: { message: Message }) {
  switch (message.role) {
    case 'user':
      return (
        <Text color={theme.user} wrap="wrap">
          ❯ {message.text}
        </Text>
      )
    case 'assistant':
      return <Text wrap="wrap">{message.text}</Text>
    case 'status':
      return (
        <Text color={theme.dim} wrap="wrap">
          · {message.text}
        </Text>
      )
    case 'tool':
      return (
        <Text color={theme.tool} wrap="wrap">
          ⚙ {message.text}
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
  }
}
