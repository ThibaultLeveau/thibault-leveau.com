import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'
export const STORAGE_KEY = 'personal-site-theme'

export const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
} | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function parsePreference(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}
