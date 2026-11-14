import type { RefObject } from 'react'

export const collectionLabels = {
  projects: 'Projets',
  experiences: 'Expériences',
  educations: 'Formations',
  certifications: 'Certifications',
  awards: 'Distinctions',
  services: 'Services',
  posts: 'Articles',
  publications: 'Interventions et publications',
  testimonials: 'Témoignages',
  skills: 'Compétences',
  technologies: 'Technologies',
  organizations: 'Organisations',
  taxonomies: 'Catégories et tags',
  media: 'Médias',
  profiles: 'Mon profil',
} as const
export type Collection = keyof typeof collectionLabels
export type Row = Record<string, string | number | boolean | null>
export type Value = string | number | boolean | null | Row[]
export type Draft = Record<string, Value>
export interface FieldSchema {
  type?: string
  title?: string
  default?: Value
  enum?: string[]
  anyOf?: FieldSchema[]
  properties?: Record<string, FieldSchema>
  $defs?: Record<string, FieldSchema>
  $ref?: string
  items?: FieldSchema
  section?: string
  widget?: string
  target?: Collection
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  maxItems?: number
  pattern?: string
}
export interface CollectionDefinition {
  label: string
  description: string
  schema: FieldSchema
}
export type Catalog = Record<Collection, CollectionDefinition>
export interface FieldError {
  path: string
  message: string
  code: string
}
export interface Item {
  id: number
  kind: Collection
  title: string
  status: 'draft' | 'ready' | 'archived'
  summary?: string
  visibility: 'private' | 'public'
  updated_at?: string
}
export interface ContentRecord {
  derived?: { expired: boolean }
  id: number
  kind: Collection
  entry: Draft
  status: Item['status']
  version: number
  created_at: string
  updated_at: string
  errors: FieldError[]
  usages: Item[]
  references: Record<number, Item>
  file: {
    original_name: string
    mime: string
    size: number
    width?: number
    height?: number
  } | null
}
export interface Listing {
  items: Item[]
  total: number
  page: number
  limit: number
}
export interface Memory {
  kind: Collection
  record: ContentRecord | null
  draft: Draft
  section: string
}
export interface DraftMemory {
  read: () => Memory | null
  write: (value: Memory | null) => void
}
export type NavigationGuard = RefObject<((next: () => void) => void) | null>
export const sections = [
  ['essential', 'Essentiel', 'Les informations qui donnent envie de comprendre.'],
  ['context', 'Contexte et dates', 'Situez la fiche et reliez-la à votre parcours.'],
  [
    'contribution',
    'Contribution et résultats',
    'Distinguez ce que vous avez fait de ce que cela a produit.',
  ],
  [
    'expertise',
    'Compétences et stack',
    'Reliez les savoir-faire et les outils réellement utilisés.',
  ],
  ['media', 'Liens et médias', 'Ajoutez des preuves et leur contexte.'],
  ['review', 'Relecture', 'Prêt + Public publie la fiche sur le site.'],
] as const
export function resolve(schema: FieldSchema, root: FieldSchema): FieldSchema {
  if (schema.$ref) return root.$defs?.[schema.$ref.split('/').pop()!] ?? schema
  if (schema.anyOf)
    return {
      ...schema,
      ...schema.anyOf.find((s) => s.type !== 'null'),
      nullable: true,
    } as FieldSchema
  return schema
}
export function defaults(schema: FieldSchema, root = schema): Draft {
  return Object.fromEntries(
    Object.entries(resolve(schema, root).properties ?? {}).map(([key, raw]) => {
      const f = resolve(raw, root)
      return [
        key,
        raw.default !== undefined
          ? raw.default
          : f.type === 'array'
            ? []
            : f.type === 'boolean'
              ? false
              : f.type === 'integer'
                ? null
                : '',
      ]
    }),
  )
}
export const statusLabels = { draft: 'Brouillon', ready: 'Prêt', archived: 'Archivé' }
export const optionLabels: Record<string, string> = {
  professional: 'Professionnel',
  personal: 'Personnel',
  association: 'Associatif',
  academic: 'Académique',
  planned: 'Prévu',
  active: 'En cours',
  completed: 'Terminé',
  paused: 'En pause',
  private: 'Confidentiel',
  public: 'Public — visible si prêt',
  onsite: 'Sur site',
  hybrid: 'Hybride',
  remote: 'À distance',
  flexible: 'Flexible',
  employment: 'Salariat',
  freelance: 'Indépendant',
  internship: 'Stage',
  apprenticeship: 'Alternance',
  volunteer: 'Bénévolat',
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
  dated: 'Date d’expiration connue',
  never: 'Sans expiration',
  unknown: 'Inconnue',
  quote: 'Sur devis',
  fixed: 'Forfait',
  from: 'À partir de',
  hour: 'Heure',
  day: 'Jour',
  talk: 'Conférence',
  podcast: 'Podcast',
  interview: 'Interview',
  external_article: 'Article externe',
  book: 'Livre',
  other: 'Autre',
  pending: 'En attente',
  granted: 'Accordée',
  refused: 'Refusée',
  employer: 'Employeur',
  client: 'Client',
  school: 'École',
  issuer: 'Certificateur',
  publisher: 'Éditeur',
  project_category: 'Catégorie de projet',
  post_category: 'Catégorie d’article',
  skill_domain: 'Domaine de compétence',
  tag: 'Tag transversal',
  image: 'Image',
  video: 'Vidéo',
  document: 'Document',
  external: 'Lien externe',
  file: 'Fichier téléversé',
  cover: 'Couverture / portrait',
  gallery: 'Galerie / logo',
  attachment: 'Pièce jointe / CV',
  private_proof: 'Justificatif privé',
  share: 'Image de partage',
  website: 'Site web',
  repository: 'Dépôt de code',
  demo: 'Démo',
  documentation: 'Documentation',
  article: 'Article',
}
export function safeHref(value: string, contact = false): string | undefined {
  if (
    Array.from(value).some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) ||
    value.includes('\\')
  )
    return undefined
  try {
    const u = new URL(value)
    if (
      contact &&
      u.protocol === 'mailto:' &&
      /^[^@/?#%]+@[^@/?#%]+\.[^@/?#%]+$/.test(u.pathname) &&
      !u.search &&
      !u.hash
    )
      return value
    if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) return value
  } catch {
    /* Invalid links remain text. */
  }
}
