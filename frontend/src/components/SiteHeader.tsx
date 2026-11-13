import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav aria-label="Navigation principale" className="flex h-full items-center justify-between gap-6">
        <a className="brand inline-flex items-center gap-3.5" href="/" aria-label="Thibault Leveau — accueil">
          <svg className="brand-mark" width="27" height="27" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 6h20v4h-8v20h-4V10H2zm20 8h4v12h6v4H22z" fill="currentColor" />
          </svg>
          <span>Thibault Leveau</span>
        </a>
        <ThemeToggle />
      </nav>
    </header>
  )
}
