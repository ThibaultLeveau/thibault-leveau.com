import { lazy, Suspense } from 'react'
import { SiteHeader } from './components/SiteHeader'
import { HomePage } from './pages/HomePage'

const AdminPage = lazy(() => import('./pages/AdminPage'))

export function App() {
  if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
    return <Suspense fallback={<p role="status">Ouverture du studio…</p>}><AdminPage /></Suspense>
  }
  return (
    <div className="site-shell mx-auto flex min-h-svh w-full max-w-[1600px] flex-col">
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <SiteHeader />
      <HomePage />
    </div>
  )
}
