import { useEffect, useState, type ReactNode } from 'react'
import { parsePreference, STORAGE_KEY, systemTheme, ThemeContext, type Theme } from './theme'

interface ThemeState {
  theme: Theme
  preference: Theme | null
}

function initialTheme(): ThemeState {
  let preference: Theme | null = null
  try {
    preference = parsePreference(localStorage.getItem(STORAGE_KEY))
  } catch {
    // The system preference still works when local storage is unavailable.
  }
  return { theme: preference ?? systemTheme(), preference }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ theme, preference }, setState] = useState<ThemeState>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (preference === null) {
        setState({ theme: event.matches ? 'dark' : 'light', preference: null })
      }
    }
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const nextPreference = parsePreference(event.newValue)
      setState({ theme: nextPreference ?? systemTheme(), preference: nextPreference })
    }
    media.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorageChange)
    return () => {
      media.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorageChange)
    }
  }, [preference])

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setState({ theme: nextTheme, preference: nextTheme })
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme)
    } catch {
      // Keep the choice in memory for this page when persistence is blocked.
    }
  }

  return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>
}
