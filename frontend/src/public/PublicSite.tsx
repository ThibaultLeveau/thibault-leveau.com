import { lazy, Suspense } from 'react'
import { SiteHeader } from '../components/SiteHeader'
import { Arrow } from './components'
import { collections, type Kind } from './content'
import { CollectionPage, sections } from './CollectionPage'
import '../styles/public.css'

const HomePage = lazy(() => import('./PublicHome'))
const DetailPage = lazy(() => import('./DetailPage'))
const AboutPage = lazy(() =>
  import('./DetailPage').then((module) => ({ default: module.AboutPage })),
)

export default function PublicSite() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const detail = Object.entries(collections)
    .map(([kind, [, prefix]]) => ({
      kind: kind as Kind,
      match: path.match(new RegExp(`^/${prefix}/(\\d+)/[^/]+$`)),
    }))
    .find((value) => value.match)
  return (
    <div className="public-site site-shell mx-auto flex min-h-svh w-full max-w-[1600px] flex-col">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <SiteHeader />
      <Suspense
        fallback={
          <main id="contenu" className="public-main" tabIndex={-1}>
            <p className="public-loading" role="status">
              Ouverture de la page…
            </p>
          </main>
        }
      >
        {path === '/' ? (
          <HomePage />
        ) : detail ? (
          <DetailPage kind={detail.kind} id={Number(detail.match![1])} />
        ) : path === '/a-propos' ? (
          <AboutPage />
        ) : sections[path] ? (
          <CollectionPage path={path} />
        ) : (
          <main id="contenu" className="public-main" tabIndex={-1}>
            <h1>Page introuvable.</h1>
            <a href="/explorer">Explorer le site</a>
          </main>
        )}
      </Suspense>
      <footer className="public-footer">
        <div className="footer-identity">
          <a href="/">
            Thibault Leveau<span className="accent">.</span>
          </a>
          <p>Projets, parcours & idées.</p>
        </div>
        <nav aria-label="Navigation de pied de page">
          <a href="/explorer">
            Explorer
            <Arrow diagonal />
          </a>
          <a href="/a-propos">À propos</a>
          <a href="/documentation/">Documentation</a>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Thibault Leveau</span>
          <a href="#contenu">Revenir en haut ↑</a>
        </div>
      </footer>
    </div>
  )
}
