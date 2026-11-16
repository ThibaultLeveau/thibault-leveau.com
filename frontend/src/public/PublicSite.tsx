import { LocalizedLink, publicPath } from './locale'
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
  const path = publicPath().replace(/\/$/, '') || '/'
  const detail = Object.entries(getCollections())
    .map(([kind, [, prefix]]) => ({
      kind: kind as Kind,
      match: path.match(new RegExp(`^/${prefix}/(\\d+)/[^/]+$`)),
    }))
    .find((value) => value.match)
  return (
    <div className="public-site site-shell mx-auto flex min-h-svh w-full max-w-[1600px] flex-col">
      <LocalizedLink className="skip-link" href="#contenu">
        {t('navigation.skip')}
      </LocalizedLink>
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
            <LocalizedLink href="/explorer">{t('public.exploreSite')}</LocalizedLink>
          </main>
        )}
      </Suspense>
      <footer className="public-footer">
        <div className="footer-identity">
          <LocalizedLink href="/">
            Thibault Leveau<span className="accent">.</span>
          </LocalizedLink>
          <p>{t('public.footerTagline')}</p>
        </div>
        <nav aria-label={t('navigation.footer')}>
          <LocalizedLink href="/explorer">
            {t('navigation.explore')}
            <Arrow diagonal />
          </LocalizedLink>
          <LocalizedLink href="/a-propos">{t('navigation.about')}</LocalizedLink>
          <LocalizedLink href="/documentation/">
            {t('options.documentation')}
          </LocalizedLink>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Thibault Leveau</span>
          <LocalizedLink href="#contenu">{t('navigation.backToTop')}</LocalizedLink>
        </div>
      </footer>
    </div>
  )
}
