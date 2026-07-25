import { Box, Static, Text, useApp, useInput } from 'ink'
import path from 'node:path'
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { completeCommand } from '../session/commands.js'
import { Session } from '../session/engine.js'
import {
  backspace,
  emptyLine,
  end,
  fromText,
  home,
  insert,
  killToEnd,
  killToStart,
  killWordBack,
  left,
  type Line,
  right,
  wordLeft,
  wordRight,
} from './lineEditor.js'
import { Markdown } from './markdown.js'
import { MessageLine, WorkingLine } from './messages.js'
import { resolveTheme, THEMES } from './theme.js'
import { ThemeProvider } from './themeContext.js'

export interface AppProps {
  cwd: string
  initialEngine: string
  initialModel?: string
  autoDev?: boolean
  autoFix?: boolean
  autoProbe?: boolean
  autoCheck?: boolean
  autoReview?: boolean
  bell?: boolean
  budgetUsd?: number
  initialTheme?: string
}

/**
 * Thin Ink frontend over the Session core: renders the transcript into
 * the Static scrollback, the live region below it, and owns nothing but
 * input editing and key routing.
 */
export function App({
  cwd,
  initialEngine,
  initialModel,
  autoDev,
  autoFix,
  autoProbe,
  autoCheck,
  autoReview,
  bell,
  budgetUsd,
  initialTheme,
}: AppProps) {
  const { exit } = useApp()
  const [themeName, setThemeName] = useState(() => resolveTheme(initialTheme).name)
  const theme = resolveTheme(themeName)
  const sessionRef = useRef<Session | null>(null)
  if (!sessionRef.current) {
    sessionRef.current = new Session({
      cwd,
      engineId: initialEngine,
      model: initialModel,
      autoDev,
      autoFix,
      autoProbe,
      autoCheck,
      autoReview,
      budgetUsd,
      // Delay lets the goodbye summary land in the Static scrollback.
      onQuit: () => setTimeout(() => exit(), 60),
    })
  }
  const session = sessionRef.current
  const state = useSyncExternalStore(
    useMemo(() => (listener: () => void) => session.subscribe(listener), [session]),
    () => session.getState(),
  )

  const [line, setLine] = useState<Line>(emptyLine)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const ctrlCArmedAtRef = useRef(0)
  const wasRunningRef = useRef(false)

  // Attention cue: ring the terminal bell when a turn completes.
  if (wasRunningRef.current && !state.running && bell !== false) {
    process.stdout.write('')
  }
  wasRunningRef.current = state.running

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      // Two-step exit: a stray ctrl+c should never kill a session.
      const now = Date.now()
      if (now - ctrlCArmedAtRef.current < 2000) {
        session.note(session.summary())
        session.dispose()
        setTimeout(() => exit(), 60)
      } else {
        ctrlCArmedAtRef.current = now
        session.note('press ctrl+c again to exit')
      }
      return
    }
    if (key.escape && state.running) {
      session.interrupt()
      return
    }
    if (key.tab && key.shift) {
      session.cycleMode()
      return
    }
    if (key.tab && line.text.startsWith('/') && !line.text.includes(' ')) {
      const matches = completeCommand(line.text.slice(1))
      if (matches.length > 0) {
        setLine(fromText(`/${matches[0]!.name}${matches[0]!.args ? ' ' : ''}`))
      }
      return
    }
    if (key.return) {
      const value = line.text.trim()
      setLine(emptyLine)
      historyIndexRef.current = -1
      if (!value) return
      historyRef.current.push(value)
      // Presentation-level command: themes belong to the view, not the core.
      if (value === '/theme' || value.startsWith('/theme ')) {
        const requested = value.slice('/theme'.length).trim()
        if (!requested) {
          session.note(`themes: ${Object.keys(THEMES).join(', ')} — /theme <name>`)
        } else if (THEMES[requested]) {
          setThemeName(requested)
          session.note(`theme → ${requested}`)
        } else {
          session.note(`unknown theme "${requested}" — themes: ${Object.keys(THEMES).join(', ')}`)
        }
        return
      }
      session.input(value)
      return
    }
    if (key.upArrow) {
      const history = historyRef.current
      if (history.length === 0) return
      const next =
        historyIndexRef.current === -1 ? history.length - 1 : Math.max(historyIndexRef.current - 1, 0)
      historyIndexRef.current = next
      setLine(fromText(history[next] ?? ''))
      return
    }
    if (key.downArrow) {
      const history = historyRef.current
      if (historyIndexRef.current === -1) return
      const next = historyIndexRef.current + 1
      if (next >= history.length) {
        historyIndexRef.current = -1
        setLine(emptyLine)
      } else {
        historyIndexRef.current = next
        setLine(fromText(history[next] ?? ''))
      }
      return
    }
    if (key.leftArrow) {
      setLine((prev) => (key.meta ? wordLeft(prev) : left(prev)))
      return
    }
    if (key.rightArrow) {
      setLine((prev) => (key.meta ? wordRight(prev) : right(prev)))
      return
    }
    if (key.backspace || key.delete) {
      setLine((prev) => (key.meta ? killWordBack(prev) : backspace(prev)))
      return
    }
    if (key.ctrl) {
      switch (char) {
        case 'a':
          setLine(home)
          return
        case 'e':
          setLine(end)
          return
        case 'k':
          setLine(killToEnd)
          return
        case 'u':
          setLine(killToStart)
          return
        case 'w':
          setLine(killWordBack)
          return
      }
      return
    }
    if (char && !key.meta) {
      setLine((prev) => insert(prev, char))
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
    <ThemeProvider value={theme}>
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
          <Markdown text={state.liveText} />
        </Box>
      )}

      {state.items.length === 0 && state.liveText.length === 0 && !state.running && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>describe what to build — or try:</Text>
          <Text color={theme.dim}>  /dev start the preview server · /review after a change · /variants 3 explore wide</Text>
          <Text color={theme.dim}>  shift+tab cycles plan/safe/yolo · type while the agent works to queue asks</Text>
        </Box>
      )}
      {state.running && (
        <Box marginTop={1}>
          <WorkingLine startedAt={state.runStartedAt} />
        </Box>
      )}
      {state.queue.map((queued, index) => (
        <Box key={index}>
          <Text color={theme.dim}>
            ⋯ {index + 1}. {queued}
            {index === state.queue.length - 1 ? '   (/queue drop <n> removes)' : ''}
          </Text>
        </Box>
      ))}
      {line.text.startsWith('/') && !line.text.includes(' ') && (
        <Box flexDirection="column">
          {completeCommand(line.text.slice(1))
            .slice(0, 5)
            .map((command, index) => (
              <Text key={command.name} color={index === 0 ? theme.accent : theme.dim}>
                /{command.name}
                {command.args ? ` ${command.args}` : ''} <Text color={theme.dim}>— {command.description}</Text>
              </Text>
            ))}
        </Box>
      )}
      <Box marginTop={state.running ? 0 : 1}>
        <Text>
          <Text color={theme.accent}>❯ </Text>
          {line.text.slice(0, line.cursor)}
          <Text inverse>{line.text[line.cursor] ?? ' '}</Text>
          {line.text.slice(line.cursor + 1)}
        </Text>
      </Box>

      <Box>
        <Text color={theme.dim}>
          <Text
            color={state.mode === 'yolo' ? theme.error : state.mode === 'plan' ? theme.user : theme.dim}
            bold={state.mode !== 'safe'}
          >
            [{state.mode}]
          </Text>
          {state.sandbox && <Text color={theme.accent} bold> [sandbox]</Text>}
          {' '}
          {state.engineId}
          {state.model ? ` · ${state.model}` : ''} · {path.basename(cwd)}
          {devBadge}
          {totalsBadge}
          {state.problems.length > 0 && (
            <Text color={theme.error}> · {state.problems.length} problem{state.problems.length === 1 ? '' : 's'}</Text>
          )}
          {' '}· shift+tab mode · /help
        </Text>
      </Box>
    </Box>
    </ThemeProvider>
  )
}
