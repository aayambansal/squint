/**
 * Themes as data: every hue decision in one registry, switchable live
 * with /theme and persistable via config. NO_COLOR forces mono.
 */
export interface Theme {
  name: string
  accent: string
  dim: string
  user: string
  error: string
  success: string
  tool: string
}

export const THEMES: Record<string, Theme> = {
  amber: {
    name: 'amber',
    accent: '#e8a33d',
    dim: 'gray',
    user: '#7aa2f7',
    error: '#f7768e',
    success: '#9ece6a',
    tool: '#7dcfff',
  },
  ocean: {
    name: 'ocean',
    accent: '#56b6c2',
    dim: 'gray',
    user: '#61afef',
    error: '#e06c75',
    success: '#98c379',
    tool: '#c678dd',
  },
  moss: {
    name: 'moss',
    accent: '#a7c080',
    dim: 'gray',
    user: '#7fbbb3',
    error: '#e67e80',
    success: '#83c092',
    tool: '#d699b6',
  },
  rose: {
    name: 'rose',
    accent: '#ebbcba',
    dim: 'gray',
    user: '#9ccfd8',
    error: '#eb6f92',
    success: '#31748f',
    tool: '#c4a7e7',
  },
  light: {
    name: 'light',
    accent: '#9a6b1f',
    dim: '#6b6f76',
    user: '#2a5db0',
    error: '#c4322e',
    success: '#3d7a37',
    tool: '#0f7b8a',
  },
  mono: {
    name: 'mono',
    accent: 'white',
    dim: 'gray',
    user: 'white',
    error: 'white',
    success: 'white',
    tool: 'gray',
  },
}

export const DEFAULT_THEME = 'amber'

export function resolveTheme(name?: string, env: NodeJS.ProcessEnv = process.env): Theme {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return THEMES.mono!
  return THEMES[name ?? DEFAULT_THEME] ?? THEMES[DEFAULT_THEME]!
}

/** Back-compat default export shape used before themes existed. */
export const theme = THEMES[DEFAULT_THEME]!
