import { t } from './i18n'
import { useTranslation } from 'react-i18next'
import { lazy, Suspense } from 'react'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const PublicSite = lazy(() => import('./public/PublicSite'))

export function App() {
  // A locale change renders the entire route again, preserving component state.
  useTranslation()
  if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
    return (
      <Suspense fallback={<p role="status">{t('studio.loading')}</p>}>
        <AdminPage />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<p role="status">{t('public.loading')}</p>}>
      <PublicSite />
    </Suspense>
  )
}
