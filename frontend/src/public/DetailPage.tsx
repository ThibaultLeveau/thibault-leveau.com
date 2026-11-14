import {
  Arrow,
  Breadcrumb,
  Cards,
  Feedback,
  Intro,
  SectionHeading,
} from './components'
import {
  collections,
  date,
  labels,
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

const relationLabels: Record<string, string> = {
  organization_id: 'Organisation',
  client_id: 'Client',
  institution_id: 'Établissement',
  issuer_id: 'Organisme',
  organizer_id: 'Organisateur',
  author_id: 'Auteur',
  domain_id: 'Domaine',
  education_id: 'Formation associée',
  skills: 'Compétences',
  technologies: 'Technologies',
  tags: 'Sujets',
  projects: 'Projets associés',
  experiences: 'Expériences',
  educations: 'Formations',
  services: 'Services associés',
  testimonials: 'Témoignages',
}
const narrative: Record<string, string> = {
  problem: 'Le point de départ',
  objectives: 'Les objectifs',
  included: 'Ce qui est inclus',
  excluded: 'Hors périmètre',
  prerequisites: 'Pour bien commencer',
  program: 'Programme et travaux',
  lessons: 'Ce que j’en retiens',
  next_steps: 'Et ensuite',
  terms: 'En pratique',
}
const listLabels: Record<string, string> = {
  responsibilities: 'Mon rôle au quotidien',
  actions: 'La mise en œuvre',
  deliverables: 'Les livrables',
  outcomes: 'Les résultats',
  benefits: 'Ce que cela apporte',
  steps: 'Le déroulement',
  interests: 'Centres d’intérêt',
  aliases: 'Également connu sous le nom',
}
const infoLabels: Record<string, string> = {
  role: 'Mon rôle',
  authority: 'Périmètre de décision',
  team: 'Équipe et collaborations',
  team_size: 'Taille de l’équipe',
  audience: 'À qui cela s’adresse',
  nature: 'Type',
  phase: 'Avancement',
  organization_alias: 'Organisation',
  department: 'Département',
  contract: 'Contrat',
  working_time: 'Rythme',
  level: 'Niveau',
  family: 'Famille',
  domain: 'Domaine',
  duration: 'Durée',
  result: 'Résultat',
  state: 'État',
  category: 'Catégorie',
  event: 'Événement',
  identifier: 'Référence',
  delivery_mode: 'Modalité',
  availability: 'Disponibilité',
  public_location: 'Localisation',
  outcome_note: 'À propos des résultats',
  date_note: 'À propos de la période',
  scope: 'Type de sujet',
}
const urls: Record<string, string> = {
  website_url: 'Site officiel',
  documentation_url: 'Documentation',
  verification_url: 'Vérifier la certification',
  publication_url: 'Accéder à la publication',
  public_contact: 'Prendre contact',
  contact_url: 'Parlons de votre projet',
  external_url: 'Ouvrir la ressource',
}

function period(entry: Entry) {
  const start = date(text(entry, 'start_date'))
  const end = entry.ongoing ? 'Aujourd’hui' : date(text(entry, 'end_date'))
  return [start, end].filter(Boolean).join(' — ')
}

function MediaView({
  item,
  use,
}: {
  item: Detail['references'][number]
  use: Row
}) {
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
          <a href={item.file_url}>Télécharger la vidéo</a>
        </video>
      ) : (
        <a
          className="public-button"
          href={item.file_url || safeLink(item.external_url || '')}
        >
          {item.title}
          <Arrow diagonal />
        </a>
      )}
      {(use.caption || item.credit || item.license) && (
        <figcaption>
          {String(use.caption || '')}
          {item.credit && <span>Crédit : {item.credit}</span>}
          {item.license && <span>{item.license}</span>}
        </figcaption>
      )}
      {!!use.transcript && (
        <details>
          <summary>Lire la transcription</summary>
          <p>{String(use.transcript)}</p>
        </details>
      )}
      {!!use.subtitles_url && safeLink(String(use.subtitles_url)) && (
        <a href={safeLink(String(use.subtitles_url))}>
          Accéder aux sous-titres
        </a>
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
  const availableNarrative = Object.entries(narrative).filter(([key]) =>
    text(d, key),
  )
  const availableLists = Object.entries(listLabels).filter(
    ([key]) => rows(d, key).length,
  )
  const hasInfo = !!(
    period(d) ||
    Object.keys(infoLabels).some((key) => text(d, key)) ||
    Object.keys(relationLabels).some(
      (key) => d[key] && !Array.isArray(d[key]),
    ) ||
    text(d, 'issue_date') ||
    text(d, 'expiry_date') ||
    text(d, 'event_date') ||
    text(d, 'award_date')
  )
  const contact = safeLink(
    text(d, 'contact_url') || text(d, 'public_contact'),
    true,
  )
  const anchors = [
    ...(body
      ? [['description', item.kind === 'posts' ? 'L’article' : 'Présentation']]
      : []),
    ...availableNarrative.map(([key, label]) => [key, label]),
    ...availableLists.map(([key, label]) => [key, label]),
    ...(metrics.length ? [['resultats', 'En chiffres']] : []),
    ...(packages.length ? [['formules', 'Les formules']] : []),
    ...(faq.length ? [['questions', 'Questions fréquentes']] : []),
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
              <h2>En quelques mots</h2>
              <dl>
                {period(d) && (
                  <div>
                    <dt>Période</dt>
                    <dd>{period(d)}</dd>
                  </div>
                )}
                {Object.entries(infoLabels).map(([key, label]) =>
                  text(d, key) ? (
                    <div key={key}>
                      <dt>
                        {key === 'level' && item.kind === 'skills'
                          ? 'Niveau autoévalué'
                          : label}
                      </dt>
                      <dd>{labels[text(d, key)] || text(d, key)}</dd>
                    </div>
                  ) : null,
                )}
                {Object.entries(relationLabels).map(([key, label]) =>
                  typeof d[key] === 'number' &&
                  item.references[Number(d[key])] ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        <a href={item.references[Number(d[key])].url}>
                          {item.references[Number(d[key])].title}
                        </a>
                      </dd>
                    </div>
                  ) : null,
                )}
                {[
                  ['issue_date', 'Obtention'],
                  ['expiry_date', 'Expiration'],
                  ['award_date', 'Date'],
                  ['event_date', 'Parution / intervention'],
                  ['revision_date', 'Mis à jour'],
                  ['first_used', 'Début de pratique'],
                  ['last_used', 'Dernière utilisation'],
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
                    <dt>Validité</dt>
                    <dd>Sans expiration</dd>
                  </div>
                )}
                {item.expired && (
                  <div>
                    <dt>Validité</dt>
                    <dd>Certification expirée</dd>
                  </div>
                )}
                {d.open_source && (
                  <div>
                    <dt>Code</dt>
                    <dd>Open source</dd>
                  </div>
                )}
                {rows(d, 'locations').map((location, i) => (
                  <div key={`place-${i}`}>
                    <dt>Lieu</dt>
                    <dd>
                      {[
                        location.label,
                        location.city,
                        location.region,
                        location.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      {location.mode && (
                        <span> · {labels[String(location.mode)]}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {(anchors.length > 2 ||
            /^ {0,3}#{1,6}\s|^ {0,3}[=-]{3,}\s*$/m.test(body)) && (
            <nav className="reading-nav" aria-label="Sommaire de la page">
              <h2>Sur cette page</h2>
              {anchors.map(([id, label]) => (
                <div key={id} className="reading-group">
                  <a href={`#${id}`}>{label}</a>
                  {id === 'description' && <ReadingContents value={body} />}
                </div>
              ))}
            </nav>
          )}
          {contact && (
            <a className="public-button primary" href={contact}>
              {text(d, 'contact_label') || 'Échangeons'}
              <Arrow diagonal />
            </a>
          )}
        </aside>
        <div className="detail-content">
          {item.kind === 'testimonials' && (
            <figure className="testimonial">
              <blockquote>« {text(d, 'quote')} »</blockquote>
              <figcaption>
                {d.anonymous
                  ? 'Témoignage anonyme'
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
                {item.kind === 'posts' ? 'L’article' : 'Présentation'}
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
              <h2>Des résultats concrets</h2>
              <div className="metric-grid">
                {metrics.map((m, i) => (
                  <div key={i}>
                    <strong>
                      {String(m.result)} <small>{String(m.unit)}</small>
                    </strong>
                    <h3>{String(m.label)}</h3>
                    {m.baseline !== '' && (
                      <p>
                        Valeur initiale : {String(m.baseline)} {String(m.unit)}
                      </p>
                    )}
                    <p>
                      {String(m.context)} {String(m.period)}
                    </p>
                    {m.proof_url && safeLink(String(m.proof_url)) && (
                      <a href={safeLink(String(m.proof_url))}>Voir la source</a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {!!packages.length && (
            <section className="detail-section" id="formules">
              <h2>Les formules</h2>
              <div className="package-grid">
                {packages.map((p, i) => (
                  <article key={i}>
                    <h3>{String(p.name)}</h3>
                    <p className="package-price">{price(p)}</p>
                    <p>{String(p.scope)}</p>
                    <small>
                      {[p.unit, p.tax_note].filter(Boolean).join(' · ')}
                    </small>
                    {contact && (
                      <a className="text-link" href={contact}>
                        En discuter
                        <Arrow />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!!faq.length && (
            <section className="detail-section" id="questions">
              <h2>Questions fréquentes</h2>
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
              <h2>Langues</h2>
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
          {Object.entries(relationLabels).map(([key, label]) => {
            const linked = rows(d, key).filter(
              (r) => item.references[Number(r.id)],
            )
            if (!linked.length) return null
            return (
              <section className="detail-section" key={key}>
                <h2>{label}</h2>
                <div className="relation-links">
                  {linked.map((r) => (
                    <a
                      key={Number(r.id)}
                      href={item.references[Number(r.id)].url}
                    >
                      <span>
                        {item.references[Number(r.id)].title}
                        {r.release && <small> {String(r.release)}</small>}
                        {r.context && <small>{String(r.context)}</small>}
                      </span>
                      <Arrow diagonal />
                    </a>
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
            Object.keys(urls).some((key) => safeLink(text(d, key), true))) && (
            <section className="detail-section">
              <h2>Pour aller plus loin</h2>
              <div className="detail-links">
                {rows(d, 'links').map((link, i) =>
                  safeLink(String(link.url)) ? (
                    <a
                      key={i}
                      className="text-link"
                      href={safeLink(String(link.url))}
                    >
                      {String(link.label) || 'Ouvrir le lien'}
                      <Arrow diagonal />
                    </a>
                  ) : null,
                )}
                {Object.entries(urls).map(([key, label]) =>
                  safeLink(text(d, key), true) ? (
                    <a
                      key={key}
                      className="text-link"
                      href={safeLink(text(d, key), true)}
                    >
                      {label}
                      <Arrow diagonal />
                    </a>
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
            title="Tout est relié"
            href={`/explorer?related=${item.id}`}
            number="↗"
            link="Explorer les liens"
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
  const parent = '/' + collections[kind][1].split('/')[0]
  return (
    <main
      id="contenu"
      className={`public-main detail-page kind-${kind}`}
      tabIndex={-1}
    >
      <Breadcrumb
        parent={collections[kind][0]}
        href={
          parent +
          (parent !== '/projets' && parent !== '/services'
            ? `?collection=${kind}`
            : '')
        }
        title={item?.title}
      />
      {!item ? (
        <>
          <Intro
            eyebrow={collections[kind][0]}
            title={state.missing ? 'Contenu introuvable' : 'Découvrir'}
          />
          <Feedback {...state} />
        </>
      ) : (
        <>
          <header className="detail-intro">
            <p className="eyebrow">
              <span />
              {collections[kind][0]}
              {item.date && ` / ${date(item.date)}`}
              {kind === 'posts' &&
                ` / ${Math.max(1, Math.ceil(text(item.entry, 'body').split(/\s+/).length / 200))} min de lecture`}
            </p>
            <h1>{item.title}</h1>
            {item.summary && <p>{item.summary}</p>}
          </header>
          <DetailBody item={item} />
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
      <Breadcrumb parent="À propos" href="/a-propos" />
      <Intro eyebrow="Derrière les projets" title={item?.title || 'À propos'}>
        <p>
          {item
            ? text(item.entry, 'tagline') || item.summary
            : 'Un parcours, des idées et l’envie de les partager.'}
        </p>
      </Intro>
      {!state.data ? (
        <Feedback {...state} />
      ) : item ? (
        <div className="about-content">
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
          <DetailBody item={item} />
        </div>
      ) : (
        <section className="about-empty">
          <h2>Le parcours se découvre aussi dans les réalisations.</h2>
          <p>
            La présentation personnelle sera disponible ici lorsqu’elle sera
            publiée.
          </p>
          <div className="hero-actions">
            <a className="public-button primary" href="/parcours">
              Découvrir le parcours
              <Arrow />
            </a>
            <a className="text-link" href="/projets">
              Voir les projets
              <Arrow diagonal />
            </a>
          </div>
        </section>
      )}
      {!!testimonials.data?.items.length && (
        <section className="public-section">
          <SectionHeading
            title="Regards croisés"
            href="/explorer?collection=testimonials"
            number="↗"
            link="Tous les témoignages"
          />
          <Cards items={testimonials.data.items} layout="rows" />
        </section>
      )}
    </main>
  )
}
