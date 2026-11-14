import { useEffect, useState } from 'react'

export const collections = {
  projects: ['Projets', 'projets'],
  experiences: ['Expériences', 'parcours/experiences'],
  skills: ['Compétences', 'expertise/competences'],
  technologies: ['Technologies', 'expertise/technologies'],
  educations: ['Formations', 'parcours/formations'],
  certifications: ['Certifications', 'parcours/certifications'],
  services: ['Services', 'services'],
  posts: ['Articles', 'journal/articles'],
  publications: ['Interventions', 'journal/interventions'],
  testimonials: ['Témoignages', 'a-propos/temoignages'],
  awards: ['Distinctions', 'parcours/distinctions'],
  profiles: ['Profil', 'a-propos/profils'],
  organizations: ['Organisations', 'explorer/organisations'],
  taxonomies: ['Catégories et tags', 'explorer/categories'],
  media: ['Médias', 'explorer/medias'],
} as const
export type Kind = keyof typeof collections
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
        if (!response.ok)
          throw new Error(response.status === 404 ? 'missing' : 'network')
        return response.json() as Promise<T>
      })
      .then((data) => setState({ data }))
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({
            error: 'Le contenu ne peut pas être chargé pour le moment.',
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
  const parsed = new Date(
    `${value}${parts.length === 2 ? '-01' : ''}T12:00:00Z`,
  )
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    ...(parts.length === 3 ? { day: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}
export const text = (entry: Entry, key: string) =>
  typeof entry[key] === 'string' || typeof entry[key] === 'number'
    ? String(entry[key])
    : ''
export const rows = (entry: Entry, key: string): Row[] =>
  Array.isArray(entry[key]) ? (entry[key] as Row[]) : []
export function safeLink(value: string, contact = false) {
  if (
    value.includes('\\') ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
    )
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
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return value
  } catch {
    /* Untrusted links remain text. */
  }
  return undefined
}

export const labels: Record<string, string> = {
  professional: 'Professionnel',
  personal: 'Personnel',
  association: 'Associatif',
  academic: 'Académique',
  planned: 'À venir',
  active: 'En cours',
  completed: 'Terminé',
  paused: 'En pause',
  employment: 'Salariat',
  freelance: 'Indépendant',
  internship: 'Stage',
  apprenticeship: 'Alternance',
  volunteer: 'Bénévolat',
  onsite: 'Sur site',
  remote: 'À distance',
  hybrid: 'Hybride',
  flexible: 'Flexible',
  technical: 'Technique',
  method: 'Méthode',
  transverse: 'Transverse',
  language: 'Langage',
  framework: 'Framework',
  data: 'Données',
  cloud: 'Cloud',
  tool: 'Outil',
  platform: 'Plateforme',
  degree: 'Diplôme',
  training: 'Formation continue',
  course: 'Cours',
  self_taught: 'Apprentissage personnel',
  attended: 'Suivie',
  earned: 'Obtenue',
  interrupted: 'Interrompue',
  preparing: 'En préparation',
  revoked: 'Révoquée',
  never: 'Sans expiration',
  unknown: 'Non précisée',
  talk: 'Conférence',
  podcast: 'Podcast',
  interview: 'Interview',
  external_article: 'Article externe',
  book: 'Livre',
  other: 'Autre',
  image: 'Image',
  video: 'Vidéo',
  document: 'Document',
  project_category: 'Catégorie de projet',
  post_category: 'Catégorie d’article',
  skill_domain: 'Domaine de compétence',
  tag: 'Tag',
}

export function price(row: Row) {
  if (row.pricing === 'quote') return 'Sur devis'
  const amount = String(row.amount ?? '')
  const [whole, decimals] = amount.split('.')
  const formatted =
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') +
    (decimals ? `,${decimals}` : '')
  const currency = row.currency === 'EUR' ? '€' : String(row.currency ?? '')
  return `${row.pricing === 'from' ? 'À partir de ' : ''}${formatted} ${currency}${row.pricing === 'hour' ? ' / heure' : row.pricing === 'day' ? ' / jour' : ''}`
}
