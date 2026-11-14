import type { ReactNode } from 'react'
import { collections, date, labels, type Item } from './content'

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      className="public-arrow"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} />
    </svg>
  )
}
export function Intro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <header className="public-intro">
      <p className="eyebrow">
        <span />
        {eyebrow}
      </p>
      <h1>
        {title}
        <span className="accent">.</span>
      </h1>
      {children && <div className="intro-copy">{children}</div>}
    </header>
  )
}
export function Feedback({
  error,
  missing,
  retry,
}: {
  error?: string
  missing?: boolean
  retry: () => void
}) {
  if (missing)
    return (
      <section className="public-empty">
        <h2>Ce contenu n’est pas disponible.</h2>
        <p>Il a peut-être été retiré ou son adresse a changé.</p>
        <a className="text-link" href="/explorer">
          Explorer les contenus <Arrow />
        </a>
      </section>
    )
  if (error)
    return (
      <section className="public-empty" role="alert">
        <h2>Une petite interruption.</h2>
        <p>{error}</p>
        <button className="public-button" onClick={retry}>
          Réessayer
        </button>
      </section>
    )
  return (
    <div className="public-loading" role="status">
      <span className="loading-line" />
      Chargement des contenus…
    </div>
  )
}
export function Empty({
  filtered = false,
  reset = '/explorer',
}: {
  filtered?: boolean
  reset?: string
}) {
  return (
    <div className="public-empty">
      <span className="empty-mark" aria-hidden="true">
        ↗
      </span>
      <h2>
        {filtered
          ? 'Aucun résultat pour cette recherche.'
          : 'La suite s’écrit ici.'}
      </h2>
      <p>
        {filtered
          ? 'Essayez un autre mot ou élargissez les filtres.'
          : 'Aucun contenu n’est publié dans cette collection pour le moment. Poursuivez la découverte.'}
      </p>
      <a className="text-link" href={filtered ? reset : '/explorer'}>
        {filtered ? 'Effacer les filtres' : 'Explorer les autres collections'}
        <Arrow />
      </a>
    </div>
  )
}
export function Card({
  item,
  index = 0,
  layout = 'grid',
  heading = 'h2',
}: {
  item: Item
  index?: number
  layout?: 'grid' | 'rows' | 'timeline'
  heading?: 'h2' | 'h3'
}) {
  const project = item.kind === 'projects'
  const Heading = heading
  return (
    <article
      className={`public-card ${project ? 'project-card' : ''} ${layout === 'timeline' ? 'timeline-card' : ''}`}
    >
      {project && layout !== 'rows' && (
        <a
          className={`project-visual tone-${index % 3}`}
          href={item.url}
          tabIndex={-1}
          aria-hidden="true"
        >
          {item.cover ? (
            <img
              src={item.cover.url}
              srcSet={item.cover.srcset}
              sizes="(max-width: 760px) 90vw, (max-width: 1120px) 45vw, 33vw"
              alt=""
              width={item.cover.width}
              height={item.cover.height}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <>
              <span className="visual-label">{collections[item.kind][0]}</span>
              <span className="visual-title">{item.title}</span>
              <span className="visual-index">
                {String(index + 1).padStart(2, '0')}
                <Arrow diagonal />
              </span>
            </>
          )}
        </a>
      )}
      <div className="card-body">
        <p className="card-meta">
          {item.domain ||
            labels[item.nature || item.family || ''] ||
            date(item.date) ||
            collections[item.kind][0]}
          {!!item.featured && <span>À la une</span>}
        </p>
        <Heading>
          <a href={item.url}>
            {item.title}
            <Arrow diagonal />
          </a>
        </Heading>
        {item.summary && <p className="card-summary">{item.summary}</p>}
        {!project && layout !== 'timeline' && (
          <span className="card-category">{collections[item.kind][0]}</span>
        )}
      </div>
    </article>
  )
}
export function Cards({
  items,
  layout = 'grid',
}: {
  items: Item[]
  layout?: 'grid' | 'rows' | 'timeline'
}) {
  if (items.length && items.every((item) => item.kind === 'skills')) {
    const groups = [
      ...new Set(items.map((item) => item.domain || 'Autres savoir-faire')),
    ]
    return (
      <div className="expertise-groups">
        {groups.map((group) => (
          <section className="expertise-group" key={group}>
            <h2>{group}</h2>
            <div className="public-cards grid">
              {items
                .filter(
                  (item) => (item.domain || 'Autres savoir-faire') === group,
                )
                .map((item, index) => (
                  <Card key={item.id} item={item} index={index} heading="h3" />
                ))}
            </div>
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className={`public-cards ${layout}`}>
      {items.map((item, index) => (
        <Card key={item.id} item={item} index={index} layout={layout} />
      ))}
    </div>
  )
}
export function SectionHeading({
  title,
  href,
  link = 'Tout découvrir',
  number,
}: {
  title: string
  href: string
  link?: string
  number: string
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-number">{number}</span>
        <h2>{title}</h2>
      </div>
      <a className="text-link" href={href}>
        {link}
        <Arrow />
      </a>
    </div>
  )
}
export function Breadcrumb({
  parent,
  href,
  title,
}: {
  parent: string
  href: string
  title?: string
}) {
  return (
    <nav className="breadcrumbs" aria-label="Fil d’Ariane">
      <a href="/">Accueil</a>
      <span aria-hidden="true">/</span>
      <a href={href} aria-current={!title ? 'page' : undefined}>
        {parent}
      </a>
      {title && (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </>
      )}
    </nav>
  )
}
