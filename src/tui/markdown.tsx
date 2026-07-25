import { Box, Text } from 'ink'
import { useTheme } from './themeContext.js'

/**
 * Structural markdown for the transcript: a pure line-based block parser
 * (testable without a terminal) rendered into Ink boxes so Yoga handles
 * wrapping at real width — the gemini-cli approach, scoped to what agent
 * output actually uses. Forgiving of unclosed fences so streaming text
 * renders sanely mid-block.
 */
export type Segment = { text: string; bold?: boolean; italic?: boolean; code?: boolean }

export type Block =
  | { type: 'para'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'item'; text: string; indent: number; ordered?: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'hr' }

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g

export function parseInline(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index! > last) segments.push({ text: text.slice(last, match.index) })
    const token = match[0]
    if (token.startsWith('**')) segments.push({ text: token.slice(2, -2), bold: true })
    else if (token.startsWith('`')) segments.push({ text: token.slice(1, -1), code: true })
    else segments.push({ text: token.slice(1, -1), italic: true })
    last = match.index! + token.length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let code: { lang: string; lines: string[] } | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (code) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: 'code', ...code })
        code = null
      } else {
        code.lines.push(rawLine)
      }
      continue
    }
    const fence = /^\s*```(\S*)/.exec(line)
    if (fence) {
      code = { lang: fence[1] ?? '', lines: [] }
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]! })
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line) && line.trim().length >= 3) {
      blocks.push({ type: 'hr' })
      continue
    }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    if (item) {
      blocks.push({ type: 'item', text: item[2]!, indent: Math.floor(item[1]!.length / 2) })
      continue
    }
    const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      blocks.push({
        type: 'item',
        text: ordered[3]!,
        indent: Math.floor(ordered[1]!.length / 2),
        ordered: ordered[2]!,
      })
      continue
    }
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      blocks.push({ type: 'quote', text: quote[1]! })
      continue
    }
    blocks.push({ type: 'para', text: line })
  }
  // Unclosed fence while streaming: show what we have as code.
  if (code) blocks.push({ type: 'code', ...code })
  return blocks
}

function Inline({ text, dim }: { text: string; dim?: boolean }) {
  const theme = useTheme()
  const segments = parseInline(text)
  return (
    <Text wrap="wrap" dimColor={dim}>
      {segments.map((segment, index) =>
        segment.code ? (
          <Text key={index} color={theme.tool}>
            {segment.text}
          </Text>
        ) : (
          <Text key={index} bold={segment.bold} italic={segment.italic}>
            {segment.text}
          </Text>
        ),
      )}
    </Text>
  )
}

export function Markdown({ text }: { text: string }) {
  const theme = useTheme()
  const blocks = parseBlocks(text)
  return (
    <Box flexDirection="column">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <Text key={index} bold color={block.level <= 2 ? theme.accent : undefined} wrap="wrap">
                {block.text}
              </Text>
            )
          case 'item':
            return (
              <Box key={index} paddingLeft={1 + block.indent * 2}>
                <Text color={theme.accent}>{block.ordered ? `${block.ordered}.` : '•'} </Text>
                <Inline text={block.text} />
              </Box>
            )
          case 'quote':
            return (
              <Box key={index} paddingLeft={1}>
                <Text color={theme.dim}>│ </Text>
                <Inline text={block.text} dim />
              </Box>
            )
          case 'code':
            return (
              <Box key={index} flexDirection="column" paddingLeft={1}>
                {block.lines.map((line, lineIndex) => (
                  <Text key={lineIndex}>
                    <Text color={theme.dim}>▏ </Text>
                    <Text color={theme.tool}>{line.length > 0 ? line : ' '}</Text>
                  </Text>
                ))}
              </Box>
            )
          case 'hr':
            return (
              <Text key={index} color={theme.dim}>
                {'─'.repeat(32)}
              </Text>
            )
          case 'para':
            return block.text.length === 0 ? (
              <Text key={index}> </Text>
            ) : (
              <Inline key={index} text={block.text} />
            )
        }
      })}
    </Box>
  )
}
