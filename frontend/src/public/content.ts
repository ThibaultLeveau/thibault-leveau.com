import { t, locale } from '../i18n'
import { useEffect, useState } from 'react'

export function getCollections() {
  return {
    projects: [t('collections.projects'), 'projets'],
    experiences: [t('collections.experiences'), 'parcours/experiences'],
    skills: [t('collections.skills'), 'expertise/competences'],
    technologies: [t('collections.technologies'), 'expertise/technologies'],
    educations: [t('collections.educations'), 'parcours/formations'],
    certifications: [t('collections.certifications'), 'parcours/certifications'],
    services: [t('collections.services'), 'services'],
    posts: [t('collections.posts'), 'journal/articles'],
    publications: [t('collections.talks'), 'journal/interventions'],
    testimonials: [t('collections.testimonials'), 'a-propos/temoignages'],
    awards: [t('collections.awards'), 'parcours/distinctions'],
    profiles: [t('collections.profile'), 'a-propos/profils'],
    organizations: [t('collections.organizations'), 'explorer/organisations'],
    taxonomies: [t('collections.taxonomies'), 'explorer/categories'],
    media: [t('collections.media'), 'explorer/medias'],
  } as const
}
export type Kind = keyof ReturnType<typeof getCollections>
export type Row = Record<string, string | number | boolean | null>
export type Value = string | number | boolean | null | Row[]
export type Entry = Record<string, Value>
export interface Item {
  id: number
  kind: Kind
  title: string
  slug: string
  summary: string
  url: string
  language: string
  featured: boolean
  date?: string
  scope?: string
  nature?: string
  family?: string
  domain?: string
  state?: string
  expiry_date?: string
  cover?: {
    url: string
    srcset?: string
    alt: string
    width: number
    height: number
    caption?: string
    credit?: string
    license?: string
  }
  file_url?: string
  external_url?: string
  credit?: string
  license?: string
  width?: number
  height?: number
}
export interface Detail extends Item {
  entry: Entry
  references: Record<number, Item>
  related: Item[]
  expired: boolean
  file?: {
    url: string
    mime: string
    size: number
    width?: number
    height?: number
  }
}
export interface Listing {
  items: Item[]
  total: number
  page: number
  limit: number
}
export interface Home {
  profile: Detail | null
  projects: Item[]
  posts: Item[]
  services: Item[]
  skills: Item[]
}

export function useContent<T>(path: string) {
  const [state, setState] = useState<{
    data?: T
    error?: string
    missing?: boolean
  }>({})
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    fetch(`/api/public/${path}`, {
      signal: abort.signal,
      cache: 'no-store',
      credentials: 'omit',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'missing' : 'network')
        return response.json() as Promise<T>
      })
      .then((data) => setState({ data }))
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({
            error: t('public.loadError'),
            missing: error.message === 'missing',
          })
      })
    return () => abort.abort()
  }, [path, retry])
  return {
    ...state,
    retry: () => {
      setState({})
      setRetry((n) => n + 1)
    },
  }
}

export function date(value: string | undefined) {
  if (!value) return ''
  const parts = value.split('-')
  if (parts.length === 1) return value
  const parsed = new Date(`${value}${parts.length === 2 ? '-01' : ''}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(locale(), {
    year: 'numeric',
    month: 'long',
    ...(parts.length === 3 ? { day: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}
export const text = (entry: Entry, key: string) =>
  typeof entry[key] === 'string' || typeof entry[key] === 'number' ? String(entry[key]) : ''
export const rows = (entry: Entry, key: string): Row[] =>
  Array.isArray(entry[key]) ? (entry[key] as Row[]) : []
export function safeLink(value: string, contact = false) {
  if (
    value.includes('\\') ||
    Array.from(value).some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
  )
    return undefined
  try {
    const url = new URL(value)
    if (
      contact &&
      url.protocol === 'mailto:' &&
      /^[^@/?#%]+@[^@/?#%]+\.[^@/?#%]+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    )
      return value
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      return value
  } catch {
    /* Untrusted links remain text. */
  }
  return undefined
}

export function getLabels(): Record<string, string> {
  return {
    professional: t('options.professional'),
    personal: t('options.personal'),
    association: t('options.association'),
    academic: t('options.academic'),
    planned: t('options.upcoming'),
    active: t('options.active'),
    completed: t('options.completed'),
    paused: t('options.paused'),
    employment: t('options.employment'),
    freelance: t('options.freelance'),
    internship: t('options.internship'),
    apprenticeship: t('options.apprenticeship'),
    volunteer: t('options.volunteer'),
    onsite: t('options.onsite'),
    remote: t('options.remote'),
    hybrid: t('options.hybrid'),
    flexible: t('options.flexible'),
    technical: t('options.technical'),
    method: t('options.method'),
    transverse: t('options.transverse'),
    language: t('options.language'),
    framework: t('options.framework'),
    data: t('options.data'),
    cloud: t('options.cloud'),
    tool: t('options.tool'),
    platform: t('options.platform'),
    degree: t('options.degree'),
    training: t('options.training'),
    course: t('options.course'),
    self_taught: t('options.selfTaught'),
    attended: t('options.attended'),
    earned: t('options.earned'),
    interrupted: t('options.interrupted'),
    preparing: t('options.preparing'),
    revoked: t('options.revoked'),
    never: t('options.never'),
    unknown: t('options.unspecified'),
    talk: t('options.talk'),
    podcast: t('options.podcast'),
    interview: t('options.interview'),
    external_article: t('options.externalArticle'),
    book: t('options.book'),
    other: t('options.other'),
    image: t('options.image'),
    video: t('options.video'),
    document: t('options.document'),
    project_category: t('options.projectCategory'),
    post_category: t('options.postCategory'),
    skill_domain: t('options.skillDomain'),
    tag: t('options.tag'),
  }
}

export function price(row: Row) {
  if (row.pricing === 'quote') return t('pricing.quote')
  const amount = String(row.amount ?? '')
  const decimals = amount.split('.')[1]?.length ?? 0
  // The API bounds amounts to 12 whole digits and 2 decimals. Keep their precision.
  const formatted = new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: String(row.currency || 'EUR'),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(amount))
  if (row.pricing === 'from') return t('pricing.from', { amount: formatted })
  if (row.pricing === 'hour') return t('pricing.perHour', { amount: formatted })
  if (row.pricing === 'day') return t('pricing.perDay', { amount: formatted })
  return formatted
}
