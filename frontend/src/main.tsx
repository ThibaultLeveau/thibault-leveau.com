import { StrictMode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { changeLanguage, i18n, isLanguage } from './i18n'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ThemeProvider } from './theme/ThemeProvider'
import './styles/app.css'

async function start() {
  // Production HTML carries the authoritative language. Vite asks the same API.
  if (!document.documentElement.dataset.interfaceLanguage) {
    const area = /^\/admin\/?$/.test(window.location.pathname) ? 'admin' : 'public'
    try {
      const response = await fetch(`/api/public/language?area=${area}`, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      })
      const value = await response.json()
      if (response.ok && isLanguage(value.language)) await changeLanguage(value.language)
    } catch {
      // The French default also works when administration is disabled or offline.
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>,
  )
}
void start()
