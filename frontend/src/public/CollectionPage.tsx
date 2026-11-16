import { LocalizedLink, publicUrl } from './locale'
import { t } from '../i18n'
import { Breadcrumb, Cards, Empty, Feedback, Intro, Arrow } from './components'
import { getCollections, useContent, type Kind, type Listing } from './content'

export function getSections(): Record<
  string,
  {
    title: string
    eyebrow: string
    description: string
    kinds: Kind[]
    layout: 'grid' | 'rows' | 'timeline'
  }
> {
  return {
    '/projets': {
      title: t('collections.projects'),
      eyebrow: t('public.projectsEyebrow'),
      description: t('public.projectsDescription'),
      kinds: ['projects'],
      layout: 'grid',
    },
    '/parcours': {
      title: t('navigation.career'),
      eyebrow: t('public.careerEyebrow'),
      description: t('public.careerDescription'),
      kinds: ['experiences', 'educations', 'certifications', 'awards'],
      layout: 'timeline',
    },
    '/expertise': {
      title: t('navigation.expertise'),
      eyebrow: t('public.expertiseEyebrow'),
      description: t('public.expertiseDescription'),
      kinds: ['skills', 'technologies'],
      layout: 'grid',
    },
    '/services': {
      title: t('collections.services'),
      eyebrow: t('public.servicesEyebrow'),
      description: t('public.servicesDescription'),
      kinds: ['services'],
      layout: 'grid',
    },
    '/journal': {
      title: t('navigation.journal'),
      eyebrow: t('public.journalEyebrow'),
      description: t('public.journalDescription'),
      kinds: ['posts', 'publications'],
      layout: 'rows',
    },
    '/explorer': {
      title: t('navigation.explore'),
      eyebrow: t('public.exploreEyebrow'),
      description: t('public.exploreDescription'),
      kinds: Object.keys(getCollections()) as Kind[],
      layout: 'rows',
    },
  }
}

export function CollectionPage({ path }: { path: string }) {
  const section = getSections()[path]
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get('collection') as Kind
  const kind = section.kinds.includes(candidate)
    ? candidate
    : path === '/explorer'
      ? ''
      : section.kinds[0]
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get('page')) || 1)))
  const q = (params.get('q') || '').slice(0, 160)
  const sort = ['selection', 'recent', 'title'].includes(params.get('sort') || '')
    ? params.get('sort')!
    : path === '/journal' || path === '/parcours'
      ? 'recent'
      : 'selection'
  const related = /^\d+$/.test(params.get('related') || '') ? params.get('related')! : ''
  const query = new URLSearchParams({
    kind,
    q,
    sort,
    page: String(page),
    limit: '12',
    ...(related ? { related } : {}),
  })
  const state = useContent<Listing>(`entries?${query}`)
  const filters = useContent<Listing>('entries?kind=taxonomies&limit=48&sort=title')
  const technologies = useContent<Listing>(
    'entries?kind=technologies&limit=48&sort=title',
  )
  const reset = path + (kind && section.kinds.length > 1 ? `?collection=${kind}` : '')
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
  const options = [...(filters.data?.items || []), ...(technologies.data?.items || [])]
  return (
    <main id="contenu" className="public-main" tabIndex={-1}>
      <Breadcrumb parent={section.title} href={path} />
      <Intro eyebrow={section.eyebrow} title={section.title}>
        <p>{section.description}</p>
      </Intro>
      {section.kinds.length > 1 && path !== '/explorer' && (
        <nav
          className="collection-tabs"
          aria-label={t('public.sectionTabs', { title: section.title })}
        >
          {section.kinds.map((k) => (
            <LocalizedLink
              key={k}
              href={`${path}?collection=${k}`}
              aria-current={kind === k ? 'page' : undefined}
            >
              {getCollections()[k][0]}
            </LocalizedLink>
          ))}
        </nav>
      )}
      <form
        className="public-filters"
        action={publicUrl(path)}
        method="get"
        role="search"
        aria-label={t('public.searchLabel')}
      >
        {path !== '/explorer' ? (
          <input type="hidden" name="collection" value={kind} />
        ) : (
          <label>
            {t('public.collection')}
            <select name="collection" defaultValue={kind}>
              <option value="">{t('public.allCollections')}</option>
              {section.kinds.map((k) => (
                <option key={k} value={k}>
                  {getCollections()[k][0]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="search-field">
          {t('common.search')}
          <input
            type="search"
            name="q"
            placeholder={t('public.searchPlaceholder')}
            defaultValue={q}
            maxLength={160}
          />
        </label>
        <label>
          {t('public.refine')}
          <select name="related" defaultValue={related}>
            <option value="">{t('public.allTopics')}</option>
            {related && !options.some((o) => String(o.id) === related) && (
              <option value={related}>{t('public.relatedContent')}</option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('public.sort')}
          <select name="sort" defaultValue={sort}>
            <option value="selection">{t('public.selected')}</option>
            <option value="recent">{t('public.newest')}</option>
            <option value="title">{t('public.alphabetical')}</option>
          </select>
        </label>
        <button className="public-button primary" type="submit">
          {t('common.search')}
          <Arrow />
        </button>
      </form>
      <div className="results-heading">
        <p role="status">
          {state.data
            ? t(q ? 'public.searchCount' : 'public.resultCount', {
                count: state.data.total,
                query: q,
              })
            : t('public.searching')}
        </p>
        {(q || related) && (
          <LocalizedLink href={reset}>{t('public.clearFilters')}</LocalizedLink>
        )}
      </div>
      {!state.data ? (
        <Feedback {...state} />
      ) : state.data.items.length ? (
        <Cards items={state.data.items} layout={section.layout} />
      ) : (
        <Empty filtered={!!(q || related || page > 1)} reset={reset} />
      )}
      {state.data && state.data.total > state.data.limit && (
        <nav className="public-pagination" aria-label={t('public.pagination')}>
          <span>
            {page > 1 && (
              <LocalizedLink
                className="public-button"
                href={pageURL(page - 1)}
                rel="prev"
              >
                {t('public.previous')}
              </LocalizedLink>
            )}
          </span>
          <p>
            {t('public.pageOf', {
              page,
              total: Math.ceil(state.data.total / state.data.limit),
            })}
          </p>
          <span>
            {page * state.data.limit < state.data.total && (
              <LocalizedLink
                className="public-button"
                href={pageURL(page + 1)}
                rel="next"
              >
                {t('public.next')}
              </LocalizedLink>
            )}
          </span>
        </nav>
      )}
      <div className="collection-end">
        <span>{t('public.exploreMore')}</span>
        <LocalizedLink
          className="text-link"
          href={path === '/explorer' ? '/projets' : '/explorer'}
        >
          {path === '/explorer'
            ? t('public.viewProjects')
            : t('public.exploreAllCollections')}
          <Arrow />
        </LocalizedLink>
      </div>
    </main>
  )
}
