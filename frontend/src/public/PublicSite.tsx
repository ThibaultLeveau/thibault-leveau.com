import { t } from '../i18n'
import { lazy, Suspense } from 'react'
import { SiteHeader } from '../components/SiteHeader'
import { Arrow } from './components'
import { getCollections, type Kind } from './content'
import { CollectionPage, getSections } from './CollectionPage'
import '../styles/public.css'

const HomePage = lazy(() => import('./PublicHome'))
const DetailPage = lazy(() => import('./DetailPage'))
const AboutPage = lazy(() =>
  import('./DetailPage').then((module) => ({ default: module.AboutPage })),
)

export default function PublicSite() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const detail = Object.entries(getCollections())
    .map(([kind, [, prefix]]) => ({
      kind: kind as Kind,
      match: path.match(new RegExp(`^/${prefix}/(\\d+)/[^/]+$`)),
    }))
    .find((value) => value.match)
  return (
    <div className="public-site site-shell mx-auto flex min-h-svh w-full max-w-[1600px] flex-col">
      <a className="skip-link" href="#contenu">
        {t('navigation.skip')}
      </a>
      <SiteHeader />
      <Suspense
        fallback={
          <main id="contenu" className="public-main" tabIndex={-1}>
            <p className="public-loading" role="status">
              {t('public.loadingPage')}
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
        ) : getSections()[path] ? (
          <CollectionPage path={path} />
        ) : (
          <main id="contenu" className="public-main" tabIndex={-1}>
            <h1>{t('public.notFound')}</h1>
            <a href="/explorer">{t('public.exploreSite')}</a>
          </main>
        )}
      </Suspense>
      <footer className="public-footer">
        <div className="footer-identity">
          <a href="/">
            Thibault Leveau<span className="accent">.</span>
          </a>
          <p>{t('public.footerTagline')}</p>
        </div>
        <nav aria-label={t('navigation.footer')}>
          <a href="/explorer">
            {t('navigation.explore')}
            <Arrow diagonal />
          </a>
          <a href="/a-propos">{t('navigation.about')}</a>
          <a href="/documentation/">{t('options.documentation')}</a>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Thibault Leveau</span>
          <a href="#contenu">{t('navigation.backToTop')}</a>
        </div>
      </footer>
    </div>
  )
}
