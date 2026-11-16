import { LocalizedLink, LanguageNotice } from './locale'
import { t } from '../i18n'
import { Arrow, Breadcrumb, Cards, Feedback, Intro, SectionHeading } from './components'
import {
  getCollections,
  date,
  getLabels,
  price,
  rows,
  safeLink,
  text,
  useContent,
  type Detail,
  type Entry,
  type Home,
  type Kind,
  type Listing,
  type Row,
} from './content'
import { Reading, ReadingContents } from './Reading'

function getRelationLabels(): Record<string, string> {
  return {
    organization_id: t('collections.organization'),
    client_id: t('options.client'),
    institution_id: t('detail.institution'),
    issuer_id: t('detail.organization'),
    organizer_id: t('detail.organizer'),
    author_id: t('detail.author'),
    domain_id: t('detail.domain'),
    education_id: t('detail.education'),
    skills: t('collections.skills'),
    technologies: t('collections.technologies'),
    tags: t('detail.topics'),
    projects: t('detail.projects'),
    experiences: t('collections.experiences'),
    educations: t('collections.educations'),
    services: t('detail.services'),
    testimonials: t('collections.testimonials'),
  }
}
function getNarrative(): Record<string, string> {
  return {
    problem: t('detail.problem'),
    objectives: t('detail.objectives'),
    included: t('detail.included'),
    excluded: t('detail.excluded'),
    prerequisites: t('detail.prerequisites'),
    program: t('detail.program'),
    lessons: t('detail.lessons'),
    next_steps: t('detail.nextSteps'),
    terms: t('detail.terms'),
  }
}
function getListLabels(): Record<string, string> {
  return {
    responsibilities: t('detail.responsibilities'),
    actions: t('detail.actions'),
    deliverables: t('detail.deliverables'),
    outcomes: t('detail.outcomes'),
    benefits: t('detail.benefits'),
    steps: t('detail.steps'),
    interests: t('detail.interests'),
    aliases: t('detail.aliases'),
  }
}
function getInfoLabels(): Record<string, string> {
  return {
    role: t('detail.role'),
    authority: t('detail.authority'),
    team: t('detail.team'),
    team_size: t('detail.teamSize'),
    audience: t('detail.audience'),
    nature: t('detail.type'),
    phase: t('detail.phase'),
    organization_alias: t('collections.organization'),
    department: t('detail.department'),
    contract: t('detail.contract'),
    working_time: t('detail.workingTime'),
    level: t('detail.level'),
    family: t('detail.family'),
    domain: t('detail.domain'),
    duration: t('detail.duration'),
    result: t('detail.result'),
    state: t('content.status'),
    category: t('detail.category'),
    event: t('detail.event'),
    identifier: t('detail.identifier'),
    delivery_mode: t('detail.deliveryMode'),
    availability: t('detail.availability'),
    public_location: t('detail.location'),
    outcome_note: t('detail.outcomeNote'),
    date_note: t('detail.dateNote'),
    scope: t('detail.scope'),
  }
}
function getUrls(): Record<string, string> {
  return {
    website_url: t('detail.website'),
    documentation_url: t('options.documentation'),
    verification_url: t('detail.verification'),
    publication_url: t('detail.publication'),
    public_contact: t('detail.contact'),
    contact_url: t('detail.contactProject'),
    external_url: t('detail.external'),
  }
}

function period(entry: Entry) {
  const start = date(text(entry, 'start_date'))
  const end = entry.ongoing ? t('detail.present') : date(text(entry, 'end_date'))
  return [start, end].filter(Boolean).join(' — ')
}

function MediaView({ item, use }: { item: Detail['references'][number]; use: Row }) {
  return (
    <figure className="public-media">
      {item.file_url && item.nature === 'image' ? (
        <img
          src={item.file_url}
          alt={use.decorative ? '' : String(use.alt || item.title)}
          width={item.width}
          height={item.height}
          loading="lazy"
          decoding="async"
        />
      ) : item.file_url && item.nature === 'video' ? (
        <video controls preload="metadata" src={item.file_url}>
          <LocalizedLink href={item.file_url}>{t('media.downloadVideo')}</LocalizedLink>
        </video>
      ) : (
        <LocalizedLink
          className="public-button"
          href={item.file_url || safeLink(item.external_url || '')}
        >
          {item.title}
          <Arrow diagonal />
        </LocalizedLink>
      )}
      {(use.caption || item.credit || item.license) && (
        <figcaption>
          {String(use.caption || '')}
          {item.credit && (
            <span>
              {t('detail.credit')} {item.credit}
            </span>
          )}
          {item.license && <span>{item.license}</span>}
        </figcaption>
      )}
      {!!use.transcript && (
        <details>
          <summary>{t('detail.readTranscript')}</summary>
          <p>{String(use.transcript)}</p>
        </details>
      )}
      {!!use.subtitles_url && safeLink(String(use.subtitles_url)) && (
        <LocalizedLink href={safeLink(String(use.subtitles_url))}>
          {t('detail.subtitles')}
        </LocalizedLink>
      )}
    </figure>
  )
}

export function DetailBody({ item }: { item: Detail }) {
  const d = item.entry
  const metrics = rows(d, 'metrics')
  const packages = rows(d, 'packages')
  const faq = rows(d, 'faq')
  const body = text(d, 'body')
  const availableNarrative = Object.entries(getNarrative()).filter(([key]) =>
    text(d, key),
  )
  const availableLists = Object.entries(getListLabels()).filter(
    ([key]) => rows(d, key).length,
  )
  const hasInfo = !!(
    period(d) ||
    Object.keys(getInfoLabels()).some((key) => text(d, key)) ||
    Object.keys(getRelationLabels()).some((key) => d[key] && !Array.isArray(d[key])) ||
    text(d, 'issue_date') ||
    text(d, 'expiry_date') ||
    text(d, 'event_date') ||
    text(d, 'award_date')
  )
  const contact = safeLink(text(d, 'contact_url') || text(d, 'public_contact'), true)
  const anchors = [
    ...(body
      ? [
          [
            'description',
            item.kind === 'posts' ? t('detail.article') : t('detail.presentation'),
          ],
        ]
      : []),
    ...availableNarrative.map(([key, label]) => [key, label]),
    ...availableLists.map(([key, label]) => [key, label]),
    ...(metrics.length ? [['resultats', t('detail.metricsHeading')]] : []),
    ...(packages.length ? [['formules', t('detail.packages')]] : []),
    ...(faq.length ? [['questions', t('detail.faq')]] : []),
  ]
  return (
    <>
      {item.cover && item.kind !== 'profiles' && (
        <figure className="detail-cover">
          <img
            src={item.cover.url}
            srcSet={item.cover.srcset}
            sizes="90vw"
            alt={item.cover.alt}
            width={item.cover.width}
            height={item.cover.height}
            fetchPriority="high"
          />
          {(item.cover.caption || item.cover.credit || item.cover.license) && (
            <figcaption>
              {[item.cover.caption, item.cover.credit, item.cover.license]
                .filter(Boolean)
                .join(' · ')}
            </figcaption>
          )}
        </figure>
      )}
      <div className="detail-layout">
        <aside className="detail-aside">
          {hasInfo && (
            <section className="detail-facts">
              <h2>{t('detail.facts')}</h2>
              <dl>
                {period(d) && (
                  <div>
                    <dt>{t('detail.period')}</dt>
                    <dd>{period(d)}</dd>
                  </div>
                )}
                {Object.entries(getInfoLabels()).map(([key, label]) =>
                  text(d, key) ? (
                    <div key={key}>
                      <dt>
                        {key === 'level' && item.kind === 'skills'
                          ? t('detail.selfAssessed')
                          : label}
                      </dt>
                      <dd>
                        {[
                          'nature',
                          'phase',
                          'family',
                          'result',
                          'state',
                          'delivery_mode',
                          'scope',
                        ].includes(key)
                          ? getLabels()[text(d, key)] || text(d, key)
                          : text(d, key)}
                      </dd>
                    </div>
                  ) : null,
                )}
                {Object.entries(getRelationLabels()).map(([key, label]) =>
                  typeof d[key] === 'number' && item.references[Number(d[key])] ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        <LocalizedLink href={item.references[Number(d[key])].url}>
                          {item.references[Number(d[key])].title}
                        </LocalizedLink>
                      </dd>
                    </div>
                  ) : null,
                )}
                {[
                  ['issue_date', t('detail.issueDate')],
                  ['expiry_date', t('detail.expiry')],
                  ['award_date', t('detail.date')],
                  ['event_date', t('detail.eventDate')],
                  ['revision_date', t('detail.updated')],
                  ['first_used', t('detail.firstUsed')],
                  ['last_used', t('detail.lastUsed')],
                ].map(([key, label]) =>
                  text(d, key) ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{date(text(d, key))}</dd>
                    </div>
                  ) : null,
                )}
                {d.validity === 'never' && (
                  <div>
                    <dt>{t('detail.validity')}</dt>
                    <dd>{t('options.never')}</dd>
                  </div>
                )}
                {item.expired && (
                  <div>
                    <dt>{t('detail.validity')}</dt>
                    <dd>{t('editor.expiredCertification')}</dd>
                  </div>
                )}
                {d.open_source && (
                  <div>
                    <dt>{t('detail.code')}</dt>
                    <dd>{t('detail.openSource')}</dd>
                  </div>
                )}
                {rows(d, 'locations').map((location, i) => (
                  <div key={`place-${i}`}>
                    <dt>{t('detail.place')}</dt>
                    <dd>
                      {[location.label, location.city, location.region, location.country]
                        .filter(Boolean)
                        .join(', ')}
                      {location.mode && (
                        <span> · {getLabels()[String(location.mode)]}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {(anchors.length > 2 || /^ {0,3}#{1,6}\s|^ {0,3}[=-]{3,}\s*$/m.test(body)) && (
            <nav className="reading-nav" aria-label={t('detail.contentsLabel')}>
              <h2>{t('detail.contentsTitle')}</h2>
              {anchors.map(([id, label]) => (
                <div key={id} className="reading-group">
                  <LocalizedLink href={`#${id}`}>{label}</LocalizedLink>
                  {id === 'description' && <ReadingContents value={body} />}
                </div>
              ))}
            </nav>
          )}
          {contact && (
            <LocalizedLink className="public-button primary" href={contact}>
              {text(d, 'contact_label') || t('detail.letsTalk')}
              <Arrow diagonal />
            </LocalizedLink>
          )}
        </aside>
        <div className="detail-content">
          {item.kind === 'testimonials' && (
            <figure className="testimonial">
              <blockquote>« {text(d, 'quote')} »</blockquote>
              <figcaption>
                {d.anonymous
                  ? t('detail.anonymous')
                  : [text(d, 'author_name'), text(d, 'author_role')]
                      .filter(Boolean)
                      .join(' · ')}
                {text(d, 'relationship') && <p>{text(d, 'relationship')}</p>}
                {text(d, 'testimonial_date') && (
                  <p>{date(text(d, 'testimonial_date'))}</p>
                )}
              </figcaption>
            </figure>
          )}
          {text(d, 'value_proposition') && (
            <p className="value-proposition">{text(d, 'value_proposition')}</p>
          )}
          {body && (
            <section id="description" className="detail-section">
              <h2 className="sr-only">
                {item.kind === 'posts' ? t('detail.article') : t('detail.presentation')}
              </h2>
              <Reading value={body} />
            </section>
          )}
          {availableNarrative.map(([key, label]) => (
            <section className="detail-section" id={key} key={key}>
              <h2>{label}</h2>
              <Reading value={text(d, key)} prefix={key} />
            </section>
          ))}
          {availableLists.map(([key, label]) => (
            <section className="detail-section" id={key} key={key}>
              <h2>{label}</h2>
              {key === 'steps' ? (
                <ol className="service-steps">
                  {rows(d, key).map((r, i) => (
                    <li key={i}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {String(r.text)}
                    </li>
                  ))}
                </ol>
              ) : (
                <ul className="detail-list">
                  {rows(d, key).map((r, i) => (
                    <li key={i}>{String(r.text)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {!!metrics.length && (
            <section className="detail-section" id="resultats">
              <h2>{t('detail.results')}</h2>
              <div className="metric-grid">
                {metrics.map((m, i) => (
                  <div key={i}>
                    <strong>
                      {String(m.result)} <small>{String(m.unit)}</small>
                    </strong>
                    <h3>{String(m.label)}</h3>
                    {m.baseline !== '' && (
                      <p>
                        {t('detail.baseline')} {String(m.baseline)} {String(m.unit)}
                      </p>
                    )}
                    <p>
                      {String(m.context)} {String(m.period)}
                    </p>
                    {m.proof_url && safeLink(String(m.proof_url)) && (
                      <LocalizedLink href={safeLink(String(m.proof_url))}>
                        {t('detail.source')}
                      </LocalizedLink>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {!!packages.length && (
            <section className="detail-section" id="formules">
              <h2>{t('detail.packages')}</h2>
              <div className="package-grid">
                {packages.map((p, i) => (
                  <article key={i}>
                    <h3>{String(p.name)}</h3>
                    <p className="package-price">{price(p)}</p>
                    <p>{String(p.scope)}</p>
                    <small>{[p.unit, p.tax_note].filter(Boolean).join(' · ')}</small>
                    {contact && (
                      <LocalizedLink className="text-link" href={contact}>
                        {t('detail.discuss')}
                        <Arrow />
                      </LocalizedLink>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!!faq.length && (
            <section className="detail-section" id="questions">
              <h2>{t('detail.faq')}</h2>
              <div className="public-faq">
                {faq.map((f, i) => (
                  <details key={i}>
                    <summary>
                      {String(f.question)}
                      <span aria-hidden="true">+</span>
                    </summary>
                    <Reading value={String(f.answer)} prefix={`faq-${i}`} />
                  </details>
                ))}
              </div>
            </section>
          )}
          {!!rows(d, 'languages').length && (
            <section className="detail-section">
              <h2>{t('detail.languages')}</h2>
              <ul className="detail-list">
                {rows(d, 'languages').map((l, i) => (
                  <li key={i}>
                    {String(l.name)}
                    {l.level ? ` · ${l.level}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Object.entries(getRelationLabels()).map(([key, label]) => {
            const linked = rows(d, key).filter((r) => item.references[Number(r.id)])
            if (!linked.length) return null
            return (
              <section className="detail-section" key={key}>
                <h2>{label}</h2>
                <div className="relation-links">
                  {linked.map((r) => (
                    <LocalizedLink
                      key={Number(r.id)}
                      href={item.references[Number(r.id)].url}
                    >
                      <span>
                        {item.references[Number(r.id)].title}
                        {r.release && <small> {String(r.release)}</small>}
                        {r.context && <small>{String(r.context)}</small>}
                      </span>
                      <Arrow diagonal />
                    </LocalizedLink>
                  ))}
                </div>
              </section>
            )
          })}
          {rows(d, 'media')
            .filter((r) => r.role !== 'cover' && item.references[Number(r.id)])
            .map((r) => (
              <MediaView
                key={Number(r.id)}
                item={item.references[Number(r.id)]}
                use={r}
              />
            ))}
          {item.kind === 'media' && (
            <>
              {item.file ? (
                <MediaView
                  item={{
                    ...item,
                    nature: text(d, 'nature'),
                    file_url: item.file.url,
                    width: item.file.width,
                    height: item.file.height,
                    credit: text(d, 'credit'),
                    license: text(d, 'license'),
                  }}
                  use={{ alt: item.title }}
                />
              ) : null}
              {!item.file && (
                <p>
                  {text(d, 'credit')}
                  {text(d, 'license') && ` · ${text(d, 'license')}`}
                </p>
              )}
            </>
          )}
          {(rows(d, 'links').length > 0 ||
            Object.keys(getUrls()).some((key) => safeLink(text(d, key), true))) && (
            <section className="detail-section">
              <h2>{t('detail.further')}</h2>
              <div className="detail-links">
                {rows(d, 'links').map((link, i) =>
                  safeLink(String(link.url)) ? (
                    <LocalizedLink
                      key={i}
                      className="text-link"
                      href={safeLink(String(link.url))}
                    >
                      {String(link.label) || t('detail.openLink')}
                      <Arrow diagonal />
                    </LocalizedLink>
                  ) : null,
                )}
                {Object.entries(getUrls()).map(([key, label]) =>
                  safeLink(text(d, key), true) ? (
                    <LocalizedLink
                      key={key}
                      className="text-link"
                      href={safeLink(text(d, key), true)}
                    >
                      {label}
                      <Arrow diagonal />
                    </LocalizedLink>
                  ) : null,
                )}
              </div>
            </section>
          )}
        </div>
      </div>
      {!!item.related.length && (
        <section className="public-section">
          <SectionHeading
            title={t('public.exploreEyebrow')}
            href={`/explorer?related=${item.id}`}
            number="↗"
            link={t('detail.exploreLinks')}
          />
          <Cards items={item.related.slice(0, 6)} layout="rows" />
        </section>
      )}
    </>
  )
}

export default function DetailPage({ kind, id }: { kind: Kind; id: number }) {
  const state = useContent<Detail>(`entries/${kind}/${id}`)
  const item = state.data
  const parent = '/' + getCollections()[kind][1].split('/')[0]
  return (
    <main id="contenu" className={`public-main detail-page kind-${kind}`} tabIndex={-1}>
      <Breadcrumb
        parent={getCollections()[kind][0]}
        href={
          parent +
          (parent !== '/projets' && parent !== '/services' ? `?collection=${kind}` : '')
        }
        title={item?.title}
      />
      {!item ? (
        <>
          <Intro
            eyebrow={getCollections()[kind][0]}
            title={state.missing ? t('detail.notFound') : t('detail.discover')}
          />
          <Feedback {...state} />
        </>
      ) : (
        <>
          <LanguageNotice item={item} />
          <header className="detail-intro" lang={item.language}>
            <p className="eyebrow">
              <span />
              {getCollections()[kind][0]}
              {item.date && ` / ${date(item.date)}`}
              {kind === 'posts' &&
                ` / ${t('public.readingTime', { count: Math.max(1, Math.ceil(text(item.entry, 'body').split(/\s+/).length / 200)) })}`}
            </p>
            <h1>{item.title}</h1>
            {item.summary && <p>{item.summary}</p>}
          </header>
          <div lang={item.language}>
            <DetailBody item={item} />
          </div>
        </>
      )}
    </main>
  )
}

export function AboutPage() {
  const state = useContent<Home>('home')
  const testimonials = useContent<Listing>('entries?kind=testimonials&limit=6')
  const item = state.data?.profile
  return (
    <main id="contenu" className="public-main about-page" tabIndex={-1}>
      <Breadcrumb parent={t('navigation.about')} href="/a-propos" />
      <Intro eyebrow={t('about.eyebrow')} title={item?.title || t('navigation.about')}>
        <p lang={item?.language}>
          {item ? text(item.entry, 'tagline') || item.summary : t('about.description')}
        </p>
      </Intro>
      {!state.data ? (
        <Feedback {...state} />
      ) : item ? (
        <div className="about-content">
          <LanguageNotice item={item} />
          {item.cover && (
            <img
              className="about-portrait"
              src={item.cover.url}
              srcSet={item.cover.srcset}
              sizes="240px"
              alt={item.cover.alt}
              width={item.cover.width}
              height={item.cover.height}
            />
          )}
          <div lang={item.language}>
            <DetailBody item={item} />
          </div>
        </div>
      ) : (
        <section className="about-empty">
          <h2>{t('about.emptyTitle')}</h2>
          <p>{t('about.emptyDescription')}</p>
          <div className="hero-actions">
            <LocalizedLink className="public-button primary" href="/parcours">
              {t('about.career')}
              <Arrow />
            </LocalizedLink>
            <LocalizedLink className="text-link" href="/projets">
              {t('public.viewProjects')}
              <Arrow diagonal />
            </LocalizedLink>
          </div>
        </section>
      )}
      {!!testimonials.data?.items.length && (
        <section className="public-section">
          <SectionHeading
            title={t('about.testimonialsTitle')}
            href="/explorer?collection=testimonials"
            number="↗"
            link={t('about.allTestimonials')}
          />
          <Cards items={testimonials.data.items} layout="rows" />
        </section>
      )}
    </main>
  )
}
