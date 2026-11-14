import { Breadcrumb, Cards, Empty, Feedback, Intro, Arrow } from './components'
import { collections, useContent, type Kind, type Listing } from './content'

export const sections: Record<
  string,
  {
    title: string
    eyebrow: string
    description: string
    kinds: Kind[]
    layout: 'grid' | 'rows' | 'timeline'
  }
> = {
  '/projets': {
    title: 'Projets',
    eyebrow: 'Du concret, avant tout',
    description:
      'Des idées mises en pratique. Le contexte, les choix et les résultats derrière chaque réalisation.',
    kinds: ['projects'],
    layout: 'grid',
  },
  '/parcours': {
    title: 'Parcours',
    eyebrow: 'Le fil des expériences',
    description:
      'Les missions, les apprentissages et les étapes qui façonnent mon parcours.',
    kinds: ['experiences', 'educations', 'certifications', 'awards'],
    layout: 'timeline',
  },
  '/expertise': {
    title: 'Expertise',
    eyebrow: 'Savoir faire. Savoir pourquoi.',
    description:
      'Des compétences et des technologies, reliées aux réalisations qui les mettent en pratique.',
    kinds: ['skills', 'technologies'],
    layout: 'grid',
  },
  '/services': {
    title: 'Services',
    eyebrow: 'Construisons la suite',
    description:
      'Une vision claire de chaque prestation : les besoins, la méthode et ce que vous obtenez.',
    kinds: ['services'],
    layout: 'grid',
  },
  '/journal': {
    title: 'Journal',
    eyebrow: 'Prendre le temps de partager',
    description:
      'Articles, réflexions et interventions. Des idées à explorer, à lire et à prolonger.',
    kinds: ['posts', 'publications'],
    layout: 'rows',
  },
  '/explorer': {
    title: 'Explorer',
    eyebrow: 'Tout est relié',
    description:
      'Un sujet en tête ? Retrouvez les réalisations, les savoir-faire, les personnes et les ressources du site.',
    kinds: Object.keys(collections) as Kind[],
    layout: 'rows',
  },
}

export function CollectionPage({ path }: { path: string }) {
  const section = sections[path]
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('collection') as Kind
  const kind = section.kinds.includes(candidate)
    ? candidate
    : path === '/explorer'
      ? ''
      : section.kinds[0]
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(params.get('page')) || 1)),
  )
  const q = (params.get('q') || '').slice(0, 160)
  const sort = ['selection', 'recent', 'title'].includes(
    params.get('sort') || '',
  )
    ? params.get('sort')!
    : path === '/journal' || path === '/parcours'
      ? 'recent'
      : 'selection'
  const related = /^\d+$/.test(params.get('related') || '')
    ? params.get('related')!
    : ''
  const query = new URLSearchParams({
    kind,
    q,
    sort,
    page: String(page),
    limit: '12',
    ...(related ? { related } : {}),
  })
  const state = useContent<Listing>(`entries?${query}`)
  const filters = useContent<Listing>(
    'entries?kind=taxonomies&limit=48&sort=title',
  )
  const technologies = useContent<Listing>(
    'entries?kind=technologies&limit=48&sort=title',
  )
  const reset =
    path + (kind && section.kinds.length > 1 ? `?collection=${kind}` : '')
  const pageURL = (n: number) => {
    const next = new URLSearchParams({
      ...(kind ? { collection: kind } : {}),
      ...(q ? { q } : {}),
      sort,
      ...(related ? { related } : {}),
      page: String(n),
    })
    return `${path}?${next}`
  }
  const options = [
    ...(filters.data?.items || []),
    ...(technologies.data?.items || []),
  ]
  return (
    <main id="contenu" className="public-main" tabIndex={-1}>
      <Breadcrumb parent={section.title} href={path} />
      <Intro eyebrow={section.eyebrow} title={section.title}>
        <p>{section.description}</p>
      </Intro>
      {section.kinds.length > 1 && path !== '/explorer' && (
        <nav
          className="collection-tabs"
          aria-label={`Rubriques ${section.title}`}
        >
          {section.kinds.map((k) => (
            <a
              key={k}
              href={`${path}?collection=${k}`}
              aria-current={kind === k ? 'page' : undefined}
            >
              {collections[k][0]}
            </a>
          ))}
        </nav>
      )}
      <form
        className="public-filters"
        action={path}
        method="get"
        role="search"
        aria-label="Rechercher dans les collections"
      >
        {path !== '/explorer' ? (
          <input type="hidden" name="collection" value={kind} />
        ) : (
          <label>
            Collection
            <select name="collection" defaultValue={kind}>
              <option value="">Toutes les collections</option>
              {section.kinds.map((k) => (
                <option key={k} value={k}>
                  {collections[k][0]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="search-field">
          Rechercher
          <input
            type="search"
            name="q"
            placeholder="Un sujet, un mot-clé…"
            defaultValue={q}
            maxLength={160}
          />
        </label>
        <label>
          Affiner
          <select name="related" defaultValue={related}>
            <option value="">Tous les sujets</option>
            {related && !options.some((o) => String(o.id) === related) && (
              <option value={related}>Contenus associés</option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trier
          <select name="sort" defaultValue={sort}>
            <option value="selection">La sélection</option>
            <option value="recent">Les plus récents</option>
            <option value="title">De A à Z</option>
          </select>
        </label>
        <button className="public-button primary" type="submit">
          Rechercher
          <Arrow />
        </button>
      </form>
      <div className="results-heading">
        <p role="status">
          {state.data
            ? `${state.data.total} contenu${state.data.total > 1 ? 's' : ''}${q ? ` pour « ${q} »` : ''}`
            : 'Recherche en cours…'}
        </p>
        {(q || related) && <a href={reset}>Effacer les filtres</a>}
      </div>
      {!state.data ? (
        <Feedback {...state} />
      ) : state.data.items.length ? (
        <Cards items={state.data.items} layout={section.layout} />
      ) : (
        <Empty filtered={!!(q || related || page > 1)} reset={reset} />
      )}
      {state.data && state.data.total > state.data.limit && (
        <nav className="public-pagination" aria-label="Pagination">
          <span>
            {page > 1 && (
              <a className="public-button" href={pageURL(page - 1)} rel="prev">
                ← Précédent
              </a>
            )}
          </span>
          <p>
            Page {page} sur {Math.ceil(state.data.total / state.data.limit)}
          </p>
          <span>
            {page * state.data.limit < state.data.total && (
              <a className="public-button" href={pageURL(page + 1)} rel="next">
                Suivant →
              </a>
            )}
          </span>
        </nav>
      )}
      <div className="collection-end">
        <span>Une autre piste à explorer ?</span>
        <a
          className="text-link"
          href={path === '/explorer' ? '/projets' : '/explorer'}
        >
          {path === '/explorer'
            ? 'Voir les projets'
            : 'Explorer toutes les collections'}
          <Arrow />
        </a>
      </div>
    </main>
  )
}
