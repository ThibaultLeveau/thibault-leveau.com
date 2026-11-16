import type { AnchorHTMLAttributes } from 'react'
import { languageName, language, t, type Language } from '../i18n'
import type { Item } from './content'

export function publicPath(path = window.location.pathname) {
  return path.replace(/^\/(fr|en)(?=\/|$)/, '') || '/'
}

export function publicUrl(href: string | undefined, code: Language = language()) {
  if (
    !href ||
    !/^\/(?:$|\?|#|fr(?:\/|$)|en(?:\/|$)|projets(?:[/?#]|$)|parcours(?:[/?#]|$)|expertise(?:[/?#]|$)|services(?:[/?#]|$)|journal(?:[/?#]|$)|a-propos(?:[/?#]|$)|explorer(?:[/?#]|$))/.test(
      href,
    )
  )
    return href
  // An explicit language (including an original-version link) must stay authoritative.
  if (/^\/(fr|en)(?=\/|$)/.test(href)) return href
  return `/${code}${href === '/' ? '' : href}`
}

export function LocalizedLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={publicUrl(href)} />
}

export function LanguageSelector() {
  return (
    <label className="language-selector">
      <span className="sr-only">{t('languages.publicSelector')}</span>
      <select
        aria-label={t('languages.publicSelector')}
        value={language()}
        onChange={(event) => {
          const code = event.target.value as Language
          document.cookie = `site_language=${code}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
          const path = publicPath()
          window.location.assign(
            `/${code}${path === '/' ? '' : path}${window.location.search}${window.location.hash}`,
          )
        }}
      >
        <option value="fr" lang="fr">
          {languageName('fr')}
        </option>
        <option value="en" lang="en">
          {languageName('en')}
        </option>
      </select>
    </label>
  )
}

export function LanguageNotice({ item }: { item?: Item | null }) {
  if (!item || item.translation_available !== false) return null
  return (
    <p className="language-notice">
      {t('languages.unavailable')}{' '}
      <a href={item.source_url} hrefLang={item.language}>
        {t('languages.readOriginal')}
      </a>
    </p>
  )
}
