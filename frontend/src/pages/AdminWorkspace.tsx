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
import { ProviderForm, AccountForm } from '../admin/SettingsForms'
import { ChatPanel } from '../admin/ChatPanel'
import { PreferencesForm } from '../admin/assistant/PreferencesForm'
import { ContentStudio } from '../admin/content/ContentStudio'
import { collectionLabels, type Collection, type DraftMemory } from '../admin/content/types'
import '../styles/admin.css'
import '../styles/content.css'
import '../styles/assistant.css'

type View = 'chat' | 'provider' | 'account' | 'agents' | Collection
type Group = 'career' | 'writing' | 'library' | 'settings'
const groups: Record<Group, { label: string; views: View[] }> = {
  career: { label: 'Parcours', views: ['experiences', 'educations', 'certifications', 'awards'] },
  writing: { label: 'Publications', views: ['posts', 'publications'] },
  library: {
    label: 'Référentiels',
    views: ['skills', 'technologies', 'organizations', 'taxonomies'],
  },
  settings: { label: 'Réglages du site', views: ['provider', 'agents', 'account'] },
}
const viewLabel = (view: View) =>
  view === 'chat'
    ? 'Chat'
    : view === 'provider'
      ? 'AI provider'
      : view === 'account'
        ? 'Admin user'
        : view === 'agents'
          ? 'Agents et rédaction'
          : collectionLabels[view]
const isContent = (view: View): view is Collection => view in collectionLabels

export default function AdminWorkspace({
  session,
  onSessionEnd,
  memory,
}: {
  session: Session
  onSessionEnd: (message: string) => void
  memory: DraftMemory
}) {
  const [initialMemory] = useState(() => memory.read())
  const [view, setView] = useState<View>(initialMemory?.kind ?? 'chat')
  const [target, setTarget] = useState<{ id?: number; serial: number }>({
    id: initialMemory?.record?.id,
    serial: 0,
  })
  const [group, setGroup] = useState<Group | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [provider, setProvider] = useState<ProviderSettings | null>(null)
  const [error, setError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navPanel = useRef<HTMLElement>(null)
  const primaryPanel = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const guardRef = useRef<((next: () => void) => void) | null>(null)
  const overlaid = mobile && (group !== null || menuOpen)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const changed = () => setMobile(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  const loadProvider = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setProvider(await adminRequest<ProviderSettings>('/provider', { signal }))
        setError('')
      } catch (e) {
        if (signal?.aborted) return
        if (e instanceof ApiError && e.status === 401)
          onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        else setError(errorMessage(e))
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
      .catch((e) => {
        if (controller.signal.aborted) return
        if (e instanceof ApiError && e.status === 401)
          onSessionEnd('Votre session a expiré. Reconnectez-vous.')
        else setError(errorMessage(e))
      })
    return () => controller.abort()
  }, [onSessionEnd])
  useEffect(() => {
    if (group) navPanel.current?.querySelector<HTMLButtonElement>('nav button')?.focus()
    else if (menuOpen) primaryPanel.current?.querySelector<HTMLButtonElement>('nav button')?.focus()
  }, [group, menuOpen])
  function guarded(next: () => void) {
    if (guardRef.current) guardRef.current(next)
    else {
      memory.write(null)
      next()
    }
  }
  function closeNavigation() {
    setGroup(null)
    setMenuOpen(false)
    requestAnimationFrame(() => {
      ;(window.matchMedia('(max-width: 600px)').matches
        ? menuButton.current
        : (opener.current ?? menuButton.current ?? settingsButton.current)
      )?.focus()
    })
  }
  function navigate(next: View, id?: number, nextGroup: Group | null = null) {
    if (mobile) {
      setGroup(null)
      setMenuOpen(false)
    }
    guarded(() => {
      setView(next)
      setTarget((current) => ({ id, serial: current.serial + 1 }))
      setGroup(mobile ? null : nextGroup)
      setMenuOpen(false)
      requestAnimationFrame(() => document.getElementById('contenu')?.focus())
    })
  }
  function openGroup(next: Group) {
    opener.current = document.activeElement as HTMLElement | null
    if (group === next) {
      closeNavigation()
      return
    }
    const open = () => {
      setGroup(next)
      setMenuOpen(false)
      if (next === 'settings' && !groups.settings.views.includes(view)) setView('provider')
    }
    if (next === 'settings') guarded(open)
    else open()
  }
  function openSettings() {
    openGroup('settings')
  }
  async function logout() {
    setLoggingOut(true)
    try {
      await adminRequest('/logout', { method: 'POST', csrf: session.csrf_token })
      memory.write(null)
      onSessionEnd('Vous êtes déconnecté.')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        memory.write(null)
        onSessionEnd('Vous êtes déconnecté.')
      } else setLogoutError(errorMessage(e))
    } finally {
      setLoggingOut(false)
    }
  }
  function link(
    label: string,
    destination: View | Group,
    icon: Parameters<typeof Icon>[0]['name'],
  ) {
    const isGroup = destination in groups
    const active = isGroup
      ? groups[destination as Group].views.includes(view)
      : view === destination
    return (
      <button
        key={destination}
        className={`sidebar-link ${active ? 'active' : ''}`}
        type="button"
        aria-label={label}
        aria-current={active && !isGroup ? 'page' : undefined}
        aria-expanded={isGroup ? group === destination : undefined}
        onClick={() => (isGroup ? openGroup(destination as Group) : navigate(destination as View))}
      >
        <Icon name={icon} />
        <span>{label}</span>
        {isGroup ? (
          <span className="settings-chevron">
            <Icon name="chevron" size={14} />
          </span>
        ) : (
          <span className="nav-indicator" />
        )}
      </button>
    )
  }
  return (
    <div
      className={`admin-shell studio-shell ${group ? 'settings-open' : ''} ${menuOpen ? 'menu-open' : ''} ${overlaid ? 'nav-overlay' : ''}`}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('dialog[open]')) return
        if (event.key === 'Escape' && (group || menuOpen)) {
          event.preventDefault()
          closeNavigation()
        }
        if (event.key === 'Tab' && overlaid) {
          const panel = group ? navPanel.current : primaryPanel.current
          const elements = panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
          if (elements?.length) {
            const first = elements[0],
              last = elements[elements.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }
      }}
    >
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <aside ref={primaryPanel} className="admin-sidebar" inert={mobile && group !== null}>
        <div className="primary-brand-row">
          <a
            className="studio-brand"
            href="/"
            aria-label="Thibault Leveau — accueil"
            onClick={(e) => {
              e.preventDefault()
              guarded(() => {
                window.location.href = '/'
              })
            }}
          >
            <span className="studio-monogram">
              tl<span>.</span>
            </span>
            <span className="sidebar-brand-text">
              Thibault Leveau<small>LE STUDIO</small>
            </span>
          </a>
          <button
            type="button"
            className="icon-button close-primary"
            aria-label="Fermer la navigation"
            onClick={closeNavigation}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Navigation administrateur">
          <div className="sidebar-section-label">ESPACE DE TRAVAIL</div>
          {link('Chat', 'chat', 'chat')}
          <div className="sidebar-section-label">CONTENUS</div>
          {link('Projets', 'projects', 'projects')}
          {link('Parcours', 'career', 'career')}
          {link('Services', 'services', 'services')}
          {link('Publications', 'writing', 'writing')}
          {link('Témoignages', 'testimonials', 'quote')}
          <div className="sidebar-section-label">BIBLIOTHÈQUE</div>
          {link('Référentiels', 'library', 'library')}
          {link('Médias', 'media', 'image')}
          {link('Mon profil', 'profiles', 'user')}
        </nav>
        <div className="sidebar-footer">
          <button
            ref={settingsButton}
            type="button"
            className={`sidebar-link ${groups.settings.views.includes(view) ? 'active' : ''}`}
            aria-expanded={group === 'settings'}
            aria-controls="settings-navigation"
            aria-label="Réglages du site"
            onClick={openSettings}
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
              disabled={loggingOut}
              onClick={() => guarded(() => void logout())}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      {overlaid && (
        <button
          className="studio-backdrop"
          aria-label="Fermer les menus"
          tabIndex={-1}
          onClick={closeNavigation}
        />
      )}
      {group && (
        <aside
          ref={navPanel}
          className="settings-sidebar"
          id="settings-navigation"
          aria-label={groups[group].label}
        >
          <button
            className="text-button back-to-menu"
            type="button"
            onClick={() => {
              setGroup(null)
              setMenuOpen(true)
            }}
          >
            ← Menu principal
          </button>
          <div className="settings-sidebar-heading">
            <div>
              <span className="eyebrow">
                {group === 'settings' ? 'PRÉFÉRENCES' : 'COLLECTIONS'}
              </span>
              <h2>{groups[group].label}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={
                group === 'settings' ? 'Fermer le menu des réglages' : 'Fermer le sous-menu'
              }
              onClick={closeNavigation}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
          <nav
            aria-label={
              group === 'settings' ? 'Navigation des réglages' : `Navigation ${groups[group].label}`
            }
          >
            {groups[group].views.map((next) => (
              <button
                key={next}
                type="button"
                className={`settings-link ${view === next ? 'active' : ''}`}
                aria-current={view === next ? 'page' : undefined}
                onClick={() => navigate(next, undefined, group)}
              >
                <Icon
                  name={next === 'provider' ? 'sparkles' : next === 'account' ? 'user' : 'writing'}
                  size={18}
                />
                <span>{viewLabel(next)}</span>
                <Icon name="chevron" size={13} />
              </button>
            ))}
          </nav>
          <p className="settings-sidebar-note">
            Un espace pour construire
            <br />
            une présentation qui vous ressemble.
          </p>
        </aside>
      )}
      <div className="admin-main" inert={overlaid}>
        <header className="admin-topbar">
          <div className="breadcrumb">
            <button
              type="button"
              ref={menuButton}
              className="studio-menu-button secondary-button"
              aria-expanded={menuOpen || Boolean(group)}
              aria-label="Ouvrir le menu"
              onClick={() => {
                opener.current = menuButton.current
                setMenuOpen(true)
                setGroup(null)
              }}
            >
              <Icon name="menu" size={17} />
              Menu
            </button>
            <span>Le studio</span>
            <Icon name="chevron" size={12} />
            <strong>{groups.settings.views.includes(view) ? 'Réglages' : viewLabel(view)}</strong>
          </div>
          <div className="topbar-actions">
            <a
              className="visit-site"
              href="/"
              onClick={(e) => {
                e.preventDefault()
                guarded(() => {
                  window.location.href = '/'
                })
              }}
            >
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
          {logoutError && (
            <p className="form-error" role="alert">
              {logoutError}
            </p>
          )}
          {error && (view === 'chat' || view === 'provider') && (
            <div className="workspace-error">
              <p className="form-error" role="alert">
                {error}
              </p>
              <button type="button" className="text-button" onClick={() => void loadProvider()}>
                Réessayer
              </button>
            </div>
          )}
          {!provider && !error && (view === 'chat' || view === 'provider') && (
            <p className="loading-state" role="status">
              Ouverture de votre espace…
            </p>
          )}
          {provider && (
            <ChatPanel
              key={`${provider.provider}:${provider.model}`}
              settings={provider}
              session={session}
              onSettings={openSettings}
              onSessionEnd={onSessionEnd}
              visible={view === 'chat'}
              onOpen={(kind, id) => navigate(kind, id)}
            />
          )}
          {view === 'provider' && provider && (
            <ProviderForm
              settings={provider}
              session={session}
              onSaved={setProvider}
              onSessionEnd={onSessionEnd}
            />
          )}
          {view === 'account' && <AccountForm session={session} onSessionEnd={onSessionEnd} />}
          {view === 'agents' && (
            <PreferencesForm session={session} guardRef={guardRef} onSessionEnd={onSessionEnd} />
          )}
          {isContent(view) && (
            <ContentStudio
              key={`${view}:${target.serial}`}
              kind={view}
              initialId={target.id}
              memory={memory}
              guardRef={guardRef}
              session={session}
              onSessionEnd={onSessionEnd}
              onOpen={(kind, id) => navigate(kind, id)}
            />
          )}
        </main>
      </div>
    </div>
  )
}
