import { t } from '../i18n'
import { Arrow, Cards, Feedback, SectionHeading } from './components'
import { safeLink, text, useContent, type Home } from './content'

function getDestinations() {
  return [
    ['/projets', t('collections.projects'), t('home.projectsDescription')],
    ['/parcours', t('navigation.career'), t('home.careerDescription')],
    ['/expertise', t('navigation.expertise'), t('home.expertiseDescription')],
    ['/services', t('collections.services'), t('home.servicesDescription')],
    ['/journal', t('navigation.journal'), t('home.journalDescription')],
    ['/a-propos', t('navigation.about'), t('home.aboutDescription')],
  ]
}
export default function PublicHome() {
  const state = useContent<Home>('home')
  const data = state.data
  const profile = data?.profile?.entry
  const contact = profile ? safeLink(text(profile, 'public_contact'), true) : undefined
  return (
    <main id="contenu" className="public-main" tabIndex={-1}>
      <section className="public-hero">
        <div className="hero-primary">
          <p className="eyebrow">
            <span />
            {profile
              ? text(profile, 'public_location') || 'Thibault Leveau'
              : t('home.eyebrow')}
          </p>
          <h1>
            {profile ? (
              text(profile, 'profession')
            ) : (
              <>
                {t('home.ideas')}
                <br />
                {t('home.work')}
                <span className="accent">.</span>
              </>
            )}
          </h1>
          <p className="hero-description">
            {profile
              ? text(profile, 'tagline') || text(profile, 'summary')
              : t('home.description')}
          </p>
          <div className="hero-actions">
            <a className="public-button primary" href="/projets">
              {t('home.discoverProjects')}
              <Arrow diagonal />
            </a>
            <a className="text-link" href={contact || '/a-propos'}>
              {contact ? t('detail.letsTalk') : t('home.getAcquainted')}
              <Arrow />
            </a>
          </div>
        </div>
        <aside className="hero-aside" aria-label={t('home.discoverSite')}>
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
          <p className="aside-label">{t('home.entryPoints')}</p>
          {[
            ['01', '/projets', t('home.viewWork')],
            ['02', '/expertise', t('home.exploreSkills')],
            ['03', '/journal', t('home.read')],
          ].map(([n, url, label]) => (
            <a key={url} href={url}>
              <span>{n}</span>
              {label}
              <Arrow diagonal />
            </a>
          ))}
          <p className="aside-note">
            {profile ? text(profile, 'availability') || t('home.profileNote') : t('home.note')}
          </p>
        </aside>
      </section>
      {!data && <Feedback {...state} />}
      {!!data?.projects.length && (
        <section className="public-section">
          <SectionHeading
            title={t('home.featuredProjects')}
            href="/projets"
            number="01"
            link={t('home.allProjects')}
          />
          <Cards items={data.projects} />
        </section>
      )}
      <section className="public-section discover-section">
        <SectionHeading
          title={t('home.discoverTitle')}
          href="/explorer"
          number={data?.projects.length ? '02' : '01'}
          link={t('home.exploreAll')}
        />
        <div className="destination-grid">
          {getDestinations().map(([url, name, desc], i) => (
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
            <p className="eyebrow">{t('home.expertiseEyebrow')}</p>
            <h2>
              {t('home.skillsStart')}
              <br />
              {t('home.skillsEnd')}
            </h2>
            <a className="text-link" href="/expertise">
              {t('home.discoverExpertise')}
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
            title={t('home.journalTitle')}
            href="/journal"
            number="03"
            link={t('home.allWriting')}
          />
          <Cards items={data.posts} layout="rows" />
        </section>
      )}
      {!!data?.services.length && (
        <section className="public-section">
          <SectionHeading
            title={t('home.servicesTitle')}
            href="/services"
            number="04"
            link={t('home.viewServices')}
          />
          <Cards items={data.services} />
        </section>
      )}
      <section className="public-outro">
        <p className="eyebrow">{t('home.outroEyebrow')}</p>
        <h2>{contact ? t('home.idea') : t('home.meet')}</h2>
        <a className="public-button primary" href={contact || '/a-propos'}>
          {contact ? t('home.talk') : t('home.profile')}
          <Arrow diagonal />
        </a>
      </section>
    </main>
  )
}
