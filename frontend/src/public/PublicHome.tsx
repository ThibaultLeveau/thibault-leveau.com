import { Arrow, Cards, Feedback, SectionHeading } from './components'
import { safeLink, text, useContent, type Home } from './content'

const destinations = [
  ['/projets', 'Projets', 'De l’idée à la réalisation.'],
  [
    '/parcours',
    'Parcours',
    'Les expériences qui construisent une trajectoire.',
  ],
  ['/expertise', 'Expertise', 'Les savoir-faire et les outils.'],
  ['/services', 'Services', 'Des réponses à vos besoins.'],
  ['/journal', 'Journal', 'Articles, interventions et points de vue.'],
  ['/a-propos', 'À propos', 'Un peu plus personnel.'],
]
export default function PublicHome() {
  const state = useContent<Home>('home')
  const data = state.data
  const profile = data?.profile?.entry
  const contact = profile
    ? safeLink(text(profile, 'public_contact'), true)
    : undefined
  return (
    <main id="contenu" className="public-main" tabIndex={-1}>
      <section className="public-hero">
        <div className="hero-primary">
          <p className="eyebrow">
            <span />
            {profile
              ? text(profile, 'public_location') || 'Thibault Leveau'
              : 'Le site personnel de Thibault Leveau'}
          </p>
          <h1>
            {profile ? (
              text(profile, 'profession')
            ) : (
              <>
                Des idées.
                <br />
                Des réalisations<span className="accent">.</span>
              </>
            )}
          </h1>
          <p className="hero-description">
            {profile
              ? text(profile, 'tagline') || text(profile, 'summary')
              : 'Mon travail, mon parcours et ce qui m’anime. Un espace pour découvrir, comprendre et échanger.'}
          </p>
          <div className="hero-actions">
            <a className="public-button primary" href="/projets">
              Découvrir les projets
              <Arrow diagonal />
            </a>
            <a className="text-link" href={contact || '/a-propos'}>
              {contact ? 'Échangeons' : 'Faire connaissance'}
              <Arrow />
            </a>
          </div>
        </div>
        <aside className="hero-aside" aria-label="Découvrir le site">
          {data?.profile?.cover && (
            <img
              className="profile-portrait"
              src={data.profile.cover.url}
              srcSet={data.profile.cover.srcset}
              sizes="160px"
              alt={data.profile.cover.alt}
              width={data.profile.cover.width}
              height={data.profile.cover.height}
              fetchPriority="high"
            />
          )}
          <p className="aside-label">Quelques portes d’entrée</p>
          {[
            ['01', '/projets', 'Voir les réalisations'],
            ['02', '/expertise', 'Explorer les savoir-faire'],
            ['03', '/journal', 'Prendre le temps de lire'],
          ].map(([n, url, label]) => (
            <a key={url} href={url}>
              <span>{n}</span>
              {label}
              <Arrow diagonal />
            </a>
          ))}
          <p className="aside-note">
            {profile
              ? text(profile, 'availability') ||
                'Chaque réalisation raconte une partie du parcours.'
              : 'Un regard sur les réalisations, les expériences et les idées.'}
          </p>
        </aside>
      </section>
      {!data && <Feedback {...state} />}
      {!!data?.projects.length && (
        <section className="public-section">
          <SectionHeading
            title="Quelques réalisations"
            href="/projets"
            number="01"
            link="Tous les projets"
          />
          <Cards items={data.projects} />
        </section>
      )}
      <section className="public-section discover-section">
        <SectionHeading
          title="À chaque curiosité, un chemin"
          href="/explorer"
          number={data?.projects.length ? '02' : '01'}
          link="Tout explorer"
        />
        <div className="destination-grid">
          {destinations.map(([url, name, desc], i) => (
            <a key={url} href={url}>
              <span className="destination-number">0{i + 1}</span>
              <h3>
                {name}
                <Arrow diagonal />
              </h3>
              <p>{desc}</p>
            </a>
          ))}
        </div>
      </section>
      {!!data?.skills.length && (
        <section className="public-section expertise-teaser">
          <div>
            <p className="eyebrow">Savoir-faire</p>
            <h2>
              Les compétences
              <br />
              prennent vie dans les projets.
            </h2>
            <a className="text-link" href="/expertise">
              Découvrir mon expertise
              <Arrow />
            </a>
          </div>
          <div className="skill-links">
            {data.skills.map((skill) => (
              <a href={skill.url} key={skill.id}>
                {skill.title}
                <Arrow diagonal />
              </a>
            ))}
          </div>
        </section>
      )}
      {!!data?.posts.length && (
        <section className="public-section">
          <SectionHeading
            title="Dans le journal"
            href="/journal"
            number="03"
            link="Tous les écrits"
          />
          <Cards items={data.posts} layout="rows" />
        </section>
      )}
      {!!data?.services.length && (
        <section className="public-section">
          <SectionHeading
            title="Travaillons ensemble"
            href="/services"
            number="04"
            link="Voir les services"
          />
          <Cards items={data.services} />
        </section>
      )}
      <section className="public-outro">
        <p className="eyebrow">La conversation continue</p>
        <h2>{contact ? 'Une idée en tête ?' : 'Faisons connaissance.'}</h2>
        <a className="public-button primary" href={contact || '/a-propos'}>
          {contact ? 'Parlons-en' : 'Découvrir mon profil'}
          <Arrow diagonal />
        </a>
      </section>
    </main>
  )
}
