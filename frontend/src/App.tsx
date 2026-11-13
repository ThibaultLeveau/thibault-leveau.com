import { SiteHeader } from './components/SiteHeader'
import { HomePage } from './pages/HomePage'

export function App() {
  return (
    <div className="site-shell mx-auto flex min-h-svh w-full max-w-[1600px] flex-col">
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <SiteHeader />
      <HomePage />
    </div>
  )
}
