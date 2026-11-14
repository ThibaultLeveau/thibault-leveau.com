import { lazy, Suspense } from 'react'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const PublicSite = lazy(() => import('./public/PublicSite'))

export function App() {
  if (
    window.location.pathname === '/admin' ||
    window.location.pathname === '/admin/'
  ) {
    return (
      <Suspense fallback={<p role="status">Ouverture du studio…</p>}>
        <AdminPage />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<p role="status">Ouverture du site…</p>}>
      <PublicSite />
    </Suspense>
  )
}
