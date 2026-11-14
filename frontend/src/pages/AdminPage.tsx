import { useCallback, useEffect, useRef, useState } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  adminRequest,
  ApiError,
  errorMessage,
  type ProviderSettings,
  type Session,
} from '../admin/api'
import { Icon } from '../admin/Icon'
import { LoginForm } from '../admin/LoginForm'
import { ProviderForm, AccountForm } from '../admin/SettingsForms'
import { ChatPanel } from '../admin/ChatPanel'
import '../styles/admin.css'

type View = 'chat' | 'provider' | 'account'

function AdminWorkspace({
  session,
  onSessionEnd,
}: {
  session: Session
  onSessionEnd: (message: string) => void
}) {
  const [view, setView] = useState<View>('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [provider, setProvider] = useState<ProviderSettings | null>(null)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsNav = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const changed = () => setMobile(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])

  const loadProvider = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const settings = await adminRequest<ProviderSettings>('/provider', { signal })
        setProvider(settings)
        setError('')
      } catch (error) {
        if (signal?.aborted) return
        if (error instanceof ApiError && error.status === 401)
          onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        else setError(errorMessage(error))
      }
    },
    [onSessionEnd],
  )

  useEffect(() => {
    const controller = new AbortController()
    adminRequest<ProviderSettings>('/provider', { signal: controller.signal })
      .then((settings) => {
        setProvider(settings)
        setError('')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401)
          onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        else setError(errorMessage(error))
      })
    return () => controller.abort()
  }, [onSessionEnd])

  useEffect(() => {
    if (settingsOpen) settingsNav.current?.focus()
  }, [settingsOpen])

  function closeSettings() {
    setSettingsOpen(false)
    settingsButton.current?.focus()
  }
  function chooseView(next: View) {
    setView(next)
    if (mobile) closeSettings()
  }
  function openSettings() {
    setSettingsOpen(true)
    if (view === 'chat') setView('provider')
  }
  async function logout() {
    setLoggingOut(true)
    try {
      await adminRequest('/logout', { method: 'POST', csrf: session.csrf_token })
      onSessionEnd('Vous êtes déconnecté.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionEnd('Vous êtes déconnecté.')
      else setError(errorMessage(error))
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div
      className={`admin-shell ${settingsOpen ? 'settings-open' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && settingsOpen) closeSettings()
      }}
    >
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <aside className="admin-sidebar">
        <a className="studio-brand" href="/" aria-label="Thibault Leveau — accueil">
          <span className="studio-monogram">
            tl<span>.</span>
          </span>
          <span className="sidebar-brand-text">
            Thibault Leveau<small>LE STUDIO</small>
          </span>
        </a>
        <div className="sidebar-section-label">ESPACE DE TRAVAIL</div>
        <nav aria-label="Navigation administrateur">
          <button
            className={`sidebar-link ${view === 'chat' ? 'active' : ''}`}
            type="button"
            aria-current={view === 'chat' ? 'page' : undefined}
            onClick={() => {
              setView('chat')
              setSettingsOpen(false)
            }}
            aria-label="Chat"
          >
            <Icon name="chat" />
            <span>Chat</span>
            <span className="nav-indicator" />
          </button>
        </nav>
        <div className="sidebar-footer">
          <button
            ref={settingsButton}
            type="button"
            className={`sidebar-link ${view !== 'chat' ? 'active' : ''}`}
            aria-expanded={settingsOpen}
            aria-controls="settings-navigation"
            aria-label="Réglages du site"
            onClick={() => (settingsOpen ? closeSettings() : openSettings())}
          >
            <Icon name="settings" />
            <span>Réglages du site</span>
            <span className="settings-chevron">
              <Icon name="chevron" size={14} />
            </span>
          </button>
          <div className="sidebar-account">
            <span className="account-avatar" aria-hidden="true">
              {session.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="account-identity">
              <strong>{session.username}</strong>
              <span>Administrateur</span>
            </div>
            <button
              type="button"
              className="icon-button logout-button"
              aria-label="Se déconnecter"
              title="Se déconnecter"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      {settingsOpen && (
        <>
          <button
            className="settings-backdrop"
            aria-label="Fermer les réglages"
            tabIndex={-1}
            onClick={closeSettings}
          />
          <aside
            className="settings-sidebar"
            id="settings-navigation"
            aria-label="Réglages du site"
          >
            <div className="settings-sidebar-heading">
              <div>
                <span className="eyebrow">PRÉFÉRENCES</span>
                <h2>Réglages du site</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Fermer le menu des réglages"
                onClick={closeSettings}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <nav aria-label="Navigation des réglages">
              <button
                ref={settingsNav}
                type="button"
                className={`settings-link ${view === 'provider' ? 'active' : ''}`}
                aria-current={view === 'provider' ? 'page' : undefined}
                onClick={() => chooseView('provider')}
              >
                <Icon name="sparkles" size={18} />
                <span>AI provider</span>
                <Icon name="chevron" size={13} />
              </button>
              <button
                type="button"
                className={`settings-link ${view === 'account' ? 'active' : ''}`}
                aria-current={view === 'account' ? 'page' : undefined}
                onClick={() => chooseView('account')}
              >
                <Icon name="user" size={18} />
                <span>Admin user</span>
                <Icon name="chevron" size={13} />
              </button>
            </nav>
            <p className="settings-sidebar-note">
              Un espace à votre image.
              <br />
              Des réglages qui vous ressemblent.
            </p>
          </aside>
        </>
      )}
      <div className="admin-main" inert={mobile && settingsOpen}>
        <header className="admin-topbar">
          <div className="breadcrumb">
            <span>Le studio</span>
            <Icon name="chevron" size={12} />
            <strong>{view === 'chat' ? 'Chat' : 'Réglages'}</strong>
          </div>
          <div className="topbar-actions">
            <a className="visit-site" href="/">
              Voir le site
              <Icon name="external" size={14} />
            </a>
            <ThemeToggle />
          </div>
        </header>
        <main
          id="contenu"
          className={`admin-content ${view === 'chat' ? 'chat-content' : ''}`}
          tabIndex={-1}
        >
          {error && (
            <div className="workspace-error">
              <p className="form-error" role="alert">
                {error}
              </p>
              <button type="button" className="text-button" onClick={() => void loadProvider()}>
                Réessayer
              </button>
            </div>
          )}
          {!provider && !error && (
            <p className="loading-state" role="status">
              Ouverture de votre espace…
            </p>
          )}
          {provider && (
            <>
              <ChatPanel
                key={`${provider.provider}:${provider.model}`}
                settings={provider}
                session={session}
                onSettings={openSettings}
                onSessionEnd={onSessionEnd}
                visible={view === 'chat'}
              />
              {view === 'provider' && (
                <ProviderForm
                  settings={provider}
                  session={session}
                  onSaved={setProvider}
                  onSessionEnd={onSessionEnd}
                />
              )}
              {view === 'account' && <AccountForm session={session} onSessionEnd={onSessionEnd} />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const endSession = useCallback((message: string) => {
    setNotice(message)
    setSession(null)
  }, [])

  useEffect(() => {
    document.title = 'Le studio · Administration — Thibault Leveau'
    const controller = new AbortController()
    adminRequest<Session>('/session', { signal: controller.signal })
      .then(setSession)
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) setSession(null)
        else setError(errorMessage(error))
      })
    return () => controller.abort()
  }, [])

  if (error)
    return (
      <div className="admin-unavailable">
        <span className="studio-monogram">
          tl<span>.</span>
        </span>
        <h1>Le studio</h1>
        <p role="alert">{error}</p>
        <div>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
          <a className="text-button" href="/documentation/administration/">
            Guide d’administration
          </a>
          <a className="text-button" href="/">
            Retour au site
          </a>
        </div>
      </div>
    )
  if (session === undefined)
    return (
      <div className="admin-unavailable" role="status">
        Ouverture du studio…
      </div>
    )
  if (session === null) return <LoginForm onLogin={setSession} notice={notice} />
  return <AdminWorkspace session={session} onSessionEnd={endSession} />
}
