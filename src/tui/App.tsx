import { Box, Static, Text, useApp, useInput } from 'ink'
import path from 'node:path'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildFixPrompt, DevServer, type DevServerState, detectDevCommand } from '../devserver/devserver.js'
import { engines, getEngine } from '../engines/registry.js'
import type { AgentEvent } from '../engines/types.js'
import { buildGatePrompt, detectGates, runGates } from '../gates/gates.js'
import { buildReviewPrompt, captureViewports } from '../preview/preview.js'
import { composePrompt } from '../prompt/brief.js'
import { runAgent } from '../runner/run.js'
import { clearState, loadState, saveState } from '../state/state.js'
import { theme } from './theme.js'

interface Message {
  id: number
  role: 'user' | 'assistant' | 'status' | 'tool' | 'error' | 'thinking'
  text: string
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const MAX_AUTO_FIX_ATTEMPTS = 2

function WorkingLine({ startedAt }: { startedAt: number }) {
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

function MessageLine({ message }: { message: Message }) {
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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [runStartedAt, setRunStartedAt] = useState(0)
  const [engineId, setEngineId] = useState(initialEngine)
  const [model, setModel] = useState<string | undefined>(initialModel)
  const [liveText, setLiveText] = useState('')
  const [devState, setDevState] = useState<DevServerState>('stopped')
  const [devUrl, setDevUrl] = useState<string | null>(null)
  const liveRef = useRef('')
  const idRef = useRef(0)
  const sessionRef = useRef<string | undefined>(undefined)
  const devRef = useRef<DevServer | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingFixRef = useRef<{ prompt: string; display: string } | null>(null)
  const fixAttemptsRef = useRef(0)
  const reviewTipShownRef = useRef(false)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)

  const push = useCallback((role: Message['role'], text: string) => {
    idRef.current += 1
    setMessages((prev) => [...prev, { id: idRef.current, role, text }])
  }, [])

  /**
   * Static transcript items are immutable once rendered, so in-progress
   * assistant text accumulates in a live buffer and commits as one block.
   */
  const commitLive = useCallback(() => {
    if (liveRef.current.length > 0) {
      push('assistant', liveRef.current)
      liveRef.current = ''
      setLiveText('')
    }
  }, [push])

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
    const saved = loadState(cwd)
    if (saved) {
      try {
        if (getEngine(saved.engine).supportsResume) {
          const mins = Math.max(1, Math.round((Date.now() - saved.at) / 60000))
          push(
            'status',
            `previous session (${mins}m ago${saved.lastAsk ? ` · "${saved.lastAsk}"` : ''}) — /resume to continue`,
          )
        }
      } catch {
        // engine no longer exists; ignore stale state
      }
    }
    return () => devRef.current?.stop()
  }, [autoDev, cwd, getDevServer, push])

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          commitLive()
          push('status', event.text)
          break
        case 'delta':
          liveRef.current += event.text
          setLiveText(liveRef.current)
          break
        case 'text':
          if (event.streamed) {
            // The complete block supersedes what streamed in.
            liveRef.current = ''
            setLiveText('')
            push('assistant', event.text)
          } else {
            liveRef.current += (liveRef.current.length > 0 ? '\n' : '') + event.text
            setLiveText(liveRef.current)
          }
          break
        case 'thinking':
          commitLive()
          push('thinking', event.text)
          break
        case 'tool':
          commitLive()
          push('tool', event.detail ? `${event.name} · ${event.detail}` : event.name)
          break
        case 'error':
          commitLive()
          push('error', event.text)
          break
        case 'result':
          if (event.sessionId) sessionRef.current = event.sessionId
          break
        case 'raw':
          break
      }
    },
    [push, commitLive],
  )

  /** Run one engine turn. `display` is what the transcript shows as the ask. */
  const runTurn = useCallback(
    async (prompt: string, display: string) => {
      push('user', display)
      setRunning(true)
      setRunStartedAt(Date.now())
      const runStart = Date.now()
      const engine = getEngine(engineId)
      const abort = new AbortController()
      abortRef.current = abort
      const result = await runAgent(
        engine,
        {
          prompt,
          cwd,
          model,
          sessionId: engine.supportsResume ? sessionRef.current : undefined,
        },
        handleEvent,
        abort.signal,
      )
      abortRef.current = null
      commitLive()
      if (result.ok) {
        const cost = result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(2)}` : ''
        const secs = result.durationMs !== undefined ? ` · ${(result.durationMs / 1000).toFixed(0)}s` : ''
        push('status', `done${secs}${cost}`)
        if (sessionRef.current) {
          saveState(cwd, {
            engine: engineId,
            sessionId: sessionRef.current,
            model,
            lastAsk: display.length > 80 ? `${display.slice(0, 79)}…` : display,
            at: Date.now(),
          })
        }
      }

      // The Lovable loop: give the dev server a moment to rebuild, then
      // sweep for fresh errors and route them back to the engine.
      const dev = devRef.current
      if (result.error !== 'interrupted' && dev && (dev.state === 'running' || dev.state === 'starting')) {
        await delay(1500)
        const errors = dev.errorsSince(runStart)
        if (errors.length > 0) {
          pendingFixRef.current = {
            prompt: buildFixPrompt(errors, dev.tail(30)),
            display: '⛑ fix dev server errors',
          }
          push('error', `dev server: ${errors.length} error line(s)\n${errors.slice(-5).join('\n')}`)
          if (autoFix && fixAttemptsRef.current < MAX_AUTO_FIX_ATTEMPTS) {
            fixAttemptsRef.current += 1
            push('status', `auto-fix attempt ${fixAttemptsRef.current}/${MAX_AUTO_FIX_ATTEMPTS}`)
            setRunning(false)
            await runTurn(pendingFixRef.current.prompt, pendingFixRef.current.display)
            return
          }
          push('status', 'type /fix to send them to the engine')
        } else {
          pendingFixRef.current = null
          if (!reviewTipShownRef.current && devUrl) {
            reviewTipShownRef.current = true
            push('status', 'tip: /review screenshots the app and has the engine critique its own work')
          }
        }
      }
      setRunning(false)
    },
    [cwd, engineId, model, push, handleEvent, commitLive, autoFix, devUrl],
  )

  /** Screenshot the running app at the review viewports. */
  const capture = useCallback(async (): Promise<{ name: string; path: string }[] | null> => {
    if (!devUrl) {
      push('error', 'dev server not running — /dev first')
      return null
    }
    push('status', 'capturing screenshots…')
    const result = await captureViewports(cwd, devUrl)
    if (!result) {
      push('error', 'no Chrome/Chromium found for screenshots')
      return null
    }
    for (const err of result.errors) push('error', `screenshot ${err}`)
    if (result.shots.length > 0) {
      push('status', `captured ${result.shots.map((s) => s.name).join(', ')} → ${path.dirname(result.shots[0]!.path)}`)
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
            push('status', `engines: ${engines.map((e) => e.id).join(', ')}`)
          } else {
            try {
              getEngine(arg)
              setEngineId(arg)
              sessionRef.current = undefined
              push('status', `engine → ${arg} (new session)`)
            } catch (err) {
              push('error', err instanceof Error ? err.message : String(err))
            }
          }
          break
        case 'model':
          setModel(arg || undefined)
          push('status', arg ? `model → ${arg}` : 'model → engine default')
          break
        case 'dev': {
          const dev = getDevServer()
          if (dev.state === 'stopped' || dev.state === 'crashed') {
            const devCommand = detectDevCommand(cwd)
            if (!devCommand) {
              push('error', 'no dev/start script found in package.json')
            } else {
              dev.start(devCommand)
              push('status', `dev server starting · ${devCommand.display}`)
            }
          } else {
            dev.stop()
            setDevUrl(null)
            push('status', 'dev server stopped')
          }
          break
        }
        case 'fix':
          if (!pendingFixRef.current) {
            push('status', 'nothing to fix — no captured errors or failed gates')
          } else {
            void runTurn(pendingFixRef.current.prompt, pendingFixRef.current.display)
          }
          break
        case 'check':
          void (async () => {
            const gates = detectGates(cwd)
            if (gates.length === 0) {
              push('status', 'no gates detected in this project')
              return
            }
            push('status', `running gates: ${gates.map((g) => g.id).join(' → ')}`)
            setRunning(true)
            setRunStartedAt(Date.now())
            const results = await runGates(cwd, gates, (result) => {
              push(
                result.ok ? 'status' : 'error',
                `${result.ok ? '✓' : '✗'} ${result.gate.id} · ${(result.durationMs / 1000).toFixed(1)}s`,
              )
            })
            setRunning(false)
            const failures = results.filter((r) => !r.ok)
            if (failures.length > 0) {
              pendingFixRef.current = {
                prompt: buildGatePrompt(failures),
                display: `⛑ fix failing gates: ${failures.map((f) => f.gate.id).join(', ')}`,
              }
              push('status', 'type /fix to send failures to the engine')
            } else {
              push('status', 'all gates passed')
            }
          })()
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
        case 'resume': {
          const saved = loadState(cwd)
          if (!saved) {
            push('status', 'no previous session for this project')
            break
          }
          try {
            if (!getEngine(saved.engine).supportsResume) {
              push('status', `previous engine ${saved.engine} cannot resume sessions`)
              break
            }
          } catch {
            push('error', `previous engine ${saved.engine} is no longer available`)
            break
          }
          setEngineId(saved.engine)
          if (saved.model) setModel(saved.model)
          sessionRef.current = saved.sessionId
          push('status', `resumed ${saved.engine} session${saved.lastAsk ? ` · "${saved.lastAsk}"` : ''}`)
          break
        }
        case 'clear':
          setMessages([])
          sessionRef.current = undefined
          clearState(cwd)
          break
        case 'help':
          push(
            'status',
            '/engine <id> · /model <name> · /dev (start/stop server) · /check (quality gates) · /fix (send failures) · /shot (screenshots) · /review [focus] (visual self-critique) · /resume (last session) · /clear (new session) · /quit',
          )
          break
        case 'quit':
        case 'exit':
          devRef.current?.stop()
          exit()
          break
        default:
          push('error', `unknown command /${name} — try /help`)
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
    if (running) {
      if (key.escape) abortRef.current?.abort()
      return
    }
    if (key.return) {
      const value = input.trim()
      setInput('')
      historyIndexRef.current = -1
      if (!value) return
      historyRef.current.push(value)
      if (value.startsWith('/')) {
        handleCommand(value)
      } else {
        void submit(value)
      }
      return
    }
    if (key.upArrow) {
      const history = historyRef.current
      if (history.length === 0) return
      const next =
        historyIndexRef.current === -1 ? history.length - 1 : Math.max(historyIndexRef.current - 1, 0)
      historyIndexRef.current = next
      setInput(history[next] ?? '')
      return
    }
    if (key.downArrow) {
      const history = historyRef.current
      if (historyIndexRef.current === -1) return
      const next = historyIndexRef.current + 1
      if (next >= history.length) {
        historyIndexRef.current = -1
        setInput('')
      } else {
        historyIndexRef.current = next
        setInput(history[next] ?? '')
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
      <Static items={messages}>
        {(message) => (
          <Box key={message.id}>
            <MessageLine message={message} />
          </Box>
        )}
      </Static>

      {liveText.length > 0 && (
        <Box>
          <Text wrap="wrap">{liveText}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        {running ? (
          <WorkingLine startedAt={runStartedAt} />
        ) : (
          <Text>
            <Text color={theme.accent}>❯ </Text>
            {input}
            <Text color={theme.accent}>▏</Text>
          </Text>
        )}
      </Box>

      <Box>
        <Text color={theme.dim}>
          {engineId}
          {model ? ` · ${model}` : ''} · {path.basename(cwd)}
          {devBadge} · /help
        </Text>
      </Box>
    </Box>
  )
}
