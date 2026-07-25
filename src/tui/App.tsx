import { Box, Static, Text, useApp, useInput } from 'ink'
import path from 'node:path'
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Session } from '../session/engine.js'
import { MessageLine, WorkingLine } from './messages.js'
import { theme } from './theme.js'

export interface AppProps {
  cwd: string
  initialEngine: string
  initialModel?: string
  autoDev?: boolean
  autoFix?: boolean
  autoProbe?: boolean
}

/**
 * Thin Ink frontend over the Session core: renders the transcript into
 * the Static scrollback, the live region below it, and owns nothing but
 * input editing and key routing.
 */
export function App({ cwd, initialEngine, initialModel, autoDev, autoFix, autoProbe }: AppProps) {
  const { exit } = useApp()
  const sessionRef = useRef<Session | null>(null)
  if (!sessionRef.current) {
    sessionRef.current = new Session({
      cwd,
      engineId: initialEngine,
      model: initialModel,
      autoDev,
      autoFix,
      autoProbe,
      onQuit: () => exit(),
    })
  }
  const session = sessionRef.current
  const state = useSyncExternalStore(
    useMemo(() => (listener: () => void) => session.subscribe(listener), [session]),
    () => session.getState(),
  )

  const [input, setInput] = useState('')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      session.dispose()
      exit()
      return
    }
    if (state.running) {
      if (key.escape) session.interrupt()
      return
    }
    if (key.return) {
      const value = input.trim()
      setInput('')
      historyIndexRef.current = -1
      if (!value) return
      historyRef.current.push(value)
      session.input(value)
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
    state.devState === 'running'
      ? ` · ${state.devUrl ?? 'dev running'}`
      : state.devState === 'starting'
        ? ' · dev starting…'
        : state.devState === 'crashed'
          ? ' · dev crashed'
          : ''
  const totalsBadge =
    state.totals.turns > 0
      ? ` · ${state.totals.turns} turn${state.totals.turns === 1 ? '' : 's'}${
          state.totals.costUsd > 0 ? ` · $${state.totals.costUsd.toFixed(2)}` : ''
        }`
      : ''

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={state.items}>
        {(item) => (
          <Box key={item.id}>
            <MessageLine message={item} />
          </Box>
        )}
      </Static>

      {state.liveText.length > 0 && (
        <Box>
          <Text wrap="wrap">{state.liveText}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        {state.running ? (
          <WorkingLine startedAt={state.runStartedAt} />
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
          {state.engineId}
          {state.model ? ` · ${state.model}` : ''} · {path.basename(cwd)}
          {devBadge}
          {totalsBadge} · /help
        </Text>
      </Box>
    </Box>
  )
}
