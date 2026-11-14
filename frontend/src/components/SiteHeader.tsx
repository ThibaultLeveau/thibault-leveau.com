import { useRef } from 'react'
import { ThemeToggle } from './ThemeToggle'

const links = [
  ['/projets', 'Projets'],
  ['/parcours', 'Parcours'],
  ['/expertise', 'Expertise'],
  ['/services', 'Services'],
  ['/journal', 'Journal'],
  ['/a-propos', 'À propos'],
]

export function SiteHeader() {
  const dialog = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const current = window.location.pathname
  const navigation = links.map(([url, name]) => (
    <a
      href={url}
      key={url}
      aria-current={
        current === url || current.startsWith(url + '/') ? 'page' : undefined
      }
    >
      {name}
    </a>
  ))
  return (
    <header className="site-header">
      <div className="public-header-inner">
        <a
          className="brand inline-flex items-center gap-3.5"
          href="/"
          aria-label="Thibault Leveau — accueil"
        >
          <svg
            className="brand-mark"
            width="27"
            height="27"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <path
              d="M2 6h20v4h-8v20h-4V10H2zm20 8h4v12h6v4H22z"
              fill="currentColor"
            />
          </svg>
          <span>Thibault Leveau</span>
        </a>
        <nav className="desktop-navigation" aria-label="Navigation principale">
          {navigation}
        </nav>
        <div className="header-tools">
          <a
            className="explore-link"
            href="/explorer"
            aria-label="Explorer les collections"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
            <span>Explorer</span>
          </a>
          <ThemeToggle />
          <button
            ref={menuButton}
            className="mobile-menu-button"
            onClick={() => dialog.current?.showModal()}
            aria-haspopup="dialog"
          >
            Menu
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M2 6h16M2 13h16" />
            </svg>
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="public-menu"
        aria-labelledby="menu-title"
        onClose={() => menuButton.current?.focus()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button',
            ),
          )
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <div className="menu-top">
          <h2 id="menu-title">À découvrir</h2>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Fermer le menu"
            autoFocus
          >
            Fermer ×
          </button>
        </div>
        <nav aria-label="Navigation mobile">
          <a href="/">Accueil</a>
          {navigation}
          <a href="/explorer">Explorer les collections</a>
        </nav>
        <p>Thibault Leveau · Site personnel</p>
      </dialog>
    </header>
  )
}
