import { createContext, useContext } from 'react'
import { theme as defaultTheme, type Theme } from './theme.js'

const ThemeContext = createContext<Theme>(defaultTheme)

export const ThemeProvider = ThemeContext.Provider

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
