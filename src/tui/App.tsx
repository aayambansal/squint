import { Box, Text, useApp, useInput, useStdout } from 'ink'
import path from 'node:path'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildFixPrompt, DevServer, type DevServerState, detectDevCommand } from '../devserver/devserver.js'
import { engines, getEngine } from '../engines/registry.js'
import type { AgentEvent } from '../engines/types.js'
import { buildReviewPrompt, captureViewports } from '../preview/preview.js'
import { composePrompt } from '../prompt/brief.js'
import { runAgent } from '../runner/run.js'
import { theme } from './theme.js'

interface Message {
  role: 'user' | 'assistant' | 'status' | 'tool' | 'error' | 'thinking'
  text: string
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const MAX_AUTO_FIX_ATTEMPTS = 2

function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])
  return <Text color={theme.accent}>{SPINNER_FRAMES[frame]}</Text>
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface AppProps {
  cwd: string
  initialEngine: string
  initialModel?: string
  autoDev?: boolean
  autoFix?: boolean
}

export function App({ cwd, initialEngine, initialModel, autoDev, autoFix }: AppProps) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [engineId, setEngineId] = useState(initialEngine)
  const [model, setModel] = useState<string | undefined>(initialModel)
  const [liveText, setLiveText] = useState('')
  const [devState, setDevState] = useState<DevServerState>('stopped')
  const [devUrl, setDevUrl] = useState<string | null>(null)
  const liveRef = useRef('')
  const sessionRef = useRef<string | undefined>(undefined)
  const devRef = useRef<DevServer | null>(null)
  const pendingErrorsRef = useRef<string[]>([])
  const fixAttemptsRef = useRef(0)
  const reviewTipShownRef = useRef(false)

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

  const clearLive = useCallback(() => {
    liveRef.current = ''
    setLiveText('')
  }, [])

  const getDevServer = useCallback((): DevServer => {
    if (!devRef.current) {
      devRef.current = new DevServer(cwd, {
        onStateChange: setDevState,
        onUrl: setDevUrl,
      })
    }
    return devRef.current
  }, [cwd])

  useEffect(() => {
    if (autoDev && detectDevCommand(cwd)) {
      getDevServer().start()
    }
    return () => devRef.current?.stop()
  }, [autoDev, cwd, getDevServer])

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          push({ role: 'status', text: event.text })
          break
        case 'delta':
          liveRef.current += event.text
          setLiveText(liveRef.current)
          break
        case 'text':
          // Streamed blocks were already shown live; commit the complete
          // block to the transcript and reset the live buffer.
          if (event.streamed) {
            clearLive()
            push({ role: 'assistant', text: event.text })
          } else {
            appendAssistant(event.text)
          }
          break
        case 'thinking':
          push({ role: 'thinking', text: event.text })
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
    [push, appendAssistant, clearLive],
  )

  /** Run one engine turn. `display` is what the transcript shows as the ask. */
  const runTurn = useCallback(
    async (prompt: string, display: string) => {
      push({ role: 'user', text: display })
      setRunning(true)
      const runStart = Date.now()
      const engine = getEngine(engineId)
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
      // Flush any live text the engine never finalized into a block.
      if (liveRef.current.length > 0) {
        push({ role: 'assistant', text: liveRef.current })
        clearLive()
      }
      if (result.ok) {
        const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
        const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
        push({ role: 'status', text: `done${secs}${cost}` })
      }

      // The Lovable loop: give the dev server a moment to rebuild, then
      // sweep for fresh errors and route them back to the engine.
      const dev = devRef.current
      if (dev && (dev.state === 'running' || dev.state === 'starting')) {
        await delay(1500)
        const errors = dev.errorsSince(runStart)
        if (errors.length > 0) {
          pendingErrorsRef.current = errors
          push({ role: 'error', text: `dev server: ${errors.length} error line(s)\n${errors.slice(-5).join('\n')}` })
          if (autoFix && fixAttemptsRef.current < MAX_AUTO_FIX_ATTEMPTS) {
            fixAttemptsRef.current += 1
            push({ role: 'status', text: `auto-fix attempt ${fixAttemptsRef.current}/${MAX_AUTO_FIX_ATTEMPTS}` })
            setRunning(false)
            await runTurn(buildFixPrompt(errors, dev.tail(30)), '⛑ fix dev server errors')
            return
          }
          push({ role: 'status', text: 'type /fix to send them to the engine' })
        } else {
          pendingErrorsRef.current = []
          if (!reviewTipShownRef.current && devUrl) {
            reviewTipShownRef.current = true
            push({ role: 'status', text: 'tip: /review screenshots the app and has the engine critique its own work' })
          }
        }
      }
      setRunning(false)
    },
    [cwd, engineId, model, push, handleEvent, clearLive, autoFix, devUrl],
  )

  /** Screenshot the running app at the review viewports. */
  const capture = useCallback(async (): Promise<{ name: string; path: string }[] | null> => {
    if (!devUrl) {
      push({ role: 'error', text: 'dev server not running — /dev first' })
      return null
    }
    push({ role: 'status', text: 'capturing screenshots…' })
    const result = await captureViewports(cwd, devUrl)
    if (!result) {
      push({ role: 'error', text: 'no Chrome/Chromium found for screenshots' })
      return null
    }
    for (const err of result.errors) push({ role: 'error', text: `screenshot ${err}` })
    if (result.shots.length > 0) {
      push({
        role: 'status',
        text: `captured ${result.shots.map((s) => s.name).join(', ')} → ${path.dirname(result.shots[0]!.path)}`,
      })
    }
    return result.shots.length > 0 ? result.shots : null
  }, [cwd, devUrl, push])

  const submit = useCallback(
    async (ask: string) => {
      fixAttemptsRef.current = 0
      // Resumable engines keep the brief in session context, so follow-up
      // turns send the raw ask; non-resumable engines get it every turn.
      const isFirstTurn = sessionRef.current === undefined
      const prompt = isFirstTurn ? composePrompt(ask, { cwd, firstTurn: true }) : ask
      await runTurn(prompt, ask)
    },
    [cwd, runTurn],
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
        case 'dev': {
          const dev = getDevServer()
          if (dev.state === 'stopped' || dev.state === 'crashed') {
            const command = detectDevCommand(cwd)
            if (!command) {
              push({ role: 'error', text: 'no dev/start script found in package.json' })
            } else {
              dev.start(command)
              push({ role: 'status', text: `dev server starting · ${command.display}` })
            }
          } else {
            dev.stop()
            setDevUrl(null)
            push({ role: 'status', text: 'dev server stopped' })
          }
          break
        }
        case 'fix':
          if (pendingErrorsRef.current.length === 0) {
            push({ role: 'status', text: 'no captured dev server errors' })
          } else {
            const dev = getDevServer()
            void runTurn(buildFixPrompt(pendingErrorsRef.current, dev.tail(30)), '⛑ fix dev server errors')
          }
          break
        case 'shot':
          void capture()
          break
        case 'review':
          void (async () => {
            const shots = await capture()
            if (shots) {
              await runTurn(buildReviewPrompt(shots, arg || undefined), `👁 review rendered UI${arg ? ` · ${arg}` : ''}`)
            }
          })()
          break
        case 'clear':
          setMessages([])
          sessionRef.current = undefined
          break
        case 'help':
          push({
            role: 'status',
            text: '/engine <id> · /model <name> · /dev (start/stop server) · /fix (send errors) · /shot (screenshots) · /review [focus] (visual self-critique) · /clear (new session) · /quit',
          })
          break
        case 'quit':
        case 'exit':
          devRef.current?.stop()
          exit()
          break
        default:
          push({ role: 'error', text: `unknown command /${name} — try /help` })
      }
    },
    [push, exit, cwd, getDevServer, runTurn, capture],
  )

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      devRef.current?.stop()
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
  const devBadge =
    devState === 'running'
      ? ` · ${devUrl ?? 'dev running'}`
      : devState === 'starting'
        ? ' · dev starting…'
        : devState === 'crashed'
          ? ' · dev crashed'
          : ''

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
          {devBadge}
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
          {message.role === 'thinking' && (
            <Text color={theme.dim} italic wrap="wrap">
              {message.text}
            </Text>
          )}
          {message.role === 'error' && (
            <Text color={theme.error} wrap="wrap">
              ✗ {message.text}
            </Text>
          )}
        </Box>
      ))}

      {liveText.length > 0 && (
        <Box>
          <Text wrap="wrap">{liveText}</Text>
        </Box>
      )}

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
