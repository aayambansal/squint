import { Box, Text, useApp, useInput, useStdout } from 'ink'
import path from 'node:path'
import { useCallback, useEffect, useRef, useState } from 'react'
import { engines, getEngine } from '../engines/registry.js'
import type { AgentEvent } from '../engines/types.js'
import { composePrompt } from '../prompt/brief.js'
import { runAgent } from '../runner/run.js'
import { theme } from './theme.js'

interface Message {
  role: 'user' | 'assistant' | 'status' | 'tool' | 'error'
  text: string
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])
  return <Text color={theme.accent}>{SPINNER_FRAMES[frame]}</Text>
}

export interface AppProps {
  cwd: string
  initialEngine: string
  initialModel?: string
}

export function App({ cwd, initialEngine, initialModel }: AppProps) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [engineId, setEngineId] = useState(initialEngine)
  const [model, setModel] = useState<string | undefined>(initialModel)
  const sessionRef = useRef<string | undefined>(undefined)

  const push = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  const appendAssistant = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, text: last.text + '\n' + text }]
      }
      return [...prev, { role: 'assistant', text }]
    })
  }, [])

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          push({ role: 'status', text: event.text })
          break
        case 'text':
          appendAssistant(event.text)
          break
        case 'tool':
          push({ role: 'tool', text: event.detail ? `${event.name} · ${event.detail}` : event.name })
          break
        case 'error':
          push({ role: 'error', text: event.text })
          break
        case 'result':
          if (event.sessionId) sessionRef.current = event.sessionId
          break
        case 'raw':
          break
      }
    },
    [push, appendAssistant],
  )

  const submit = useCallback(
    async (ask: string) => {
      push({ role: 'user', text: ask })
      setRunning(true)
      const engine = getEngine(engineId)
      const isFirstTurn = sessionRef.current === undefined
      const prompt = isFirstTurn ? composePrompt(ask, { cwd }) : ask
      const result = await runAgent(
        engine,
        {
          prompt,
          cwd,
          model,
          sessionId: engine.supportsResume ? sessionRef.current : undefined,
        },
        handleEvent,
      )
      if (result.ok) {
        const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
        const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
        push({ role: 'status', text: `done${secs}${cost}` })
      }
      setRunning(false)
    },
    [cwd, engineId, model, push, handleEvent],
  )

  const handleCommand = useCallback(
    (command: string) => {
      const [name, ...rest] = command.slice(1).split(/\s+/)
      const arg = rest.join(' ').trim()
      switch (name) {
        case 'engine':
          if (!arg) {
            push({ role: 'status', text: `engines: ${engines.map((e) => e.id).join(', ')}` })
          } else {
            try {
              getEngine(arg)
              setEngineId(arg)
              sessionRef.current = undefined
              push({ role: 'status', text: `engine → ${arg} (new session)` })
            } catch (err) {
              push({ role: 'error', text: err instanceof Error ? err.message : String(err) })
            }
          }
          break
        case 'model':
          setModel(arg || undefined)
          push({ role: 'status', text: arg ? `model → ${arg}` : 'model → engine default' })
          break
        case 'clear':
          setMessages([])
          sessionRef.current = undefined
          break
        case 'help':
          push({
            role: 'status',
            text: '/engine <id> · /model <name> · /clear (new session) · /quit',
          })
          break
        case 'quit':
        case 'exit':
          exit()
          break
        default:
          push({ role: 'error', text: `unknown command /${name} — try /help` })
      }
    },
    [push, exit],
  )

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit()
      return
    }
    if (running) return
    if (key.return) {
      const value = input.trim()
      setInput('')
      if (!value) return
      if (value.startsWith('/')) {
        handleCommand(value)
      } else {
        void submit(value)
      }
      return
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1))
      return
    }
    if (char && !key.ctrl && !key.meta) {
      setInput((prev) => prev + char)
    }
  })

  const rows = stdout?.rows ?? 24
  const visible = messages.slice(-(Math.max(rows - 8, 4)))

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={theme.accent}>
          squint
        </Text>
        <Text color={theme.dim}>
          {'  '}
          {engineId}
          {model ? ` · ${model}` : ''} · {path.basename(cwd)}
        </Text>
      </Box>

      {visible.map((message, index) => (
        <Box key={index}>
          {message.role === 'user' && (
            <Text color={theme.user} wrap="wrap">
              ❯ {message.text}
            </Text>
          )}
          {message.role === 'assistant' && <Text wrap="wrap">{message.text}</Text>}
          {message.role === 'status' && (
            <Text color={theme.dim} wrap="wrap">
              · {message.text}
            </Text>
          )}
          {message.role === 'tool' && (
            <Text color={theme.tool} wrap="wrap">
              ⚙ {message.text}
            </Text>
          )}
          {message.role === 'error' && (
            <Text color={theme.error} wrap="wrap">
              ✗ {message.text}
            </Text>
          )}
        </Box>
      ))}

      <Box marginTop={1}>
        {running ? (
          <>
            <Spinner />
            <Text color={theme.dim}> working…</Text>
          </>
        ) : (
          <Text>
            <Text color={theme.accent}>❯ </Text>
            {input}
            <Text color={theme.accent}>▏</Text>
          </Text>
        )}
      </Box>

      <Box>
        <Text color={theme.dim}>enter send · /help commands · ctrl+c quit</Text>
      </Box>
    </Box>
  )
}
