import { t } from '../../i18n'
import type { RefObject } from 'react'

export function getCollectionLabels() {
  return {
    projects: t('collections.projects'),
    experiences: t('collections.experiences'),
    educations: t('collections.educations'),
    certifications: t('collections.certifications'),
    awards: t('collections.awards'),
    services: t('collections.services'),
    posts: t('collections.posts'),
    publications: t('collections.publications'),
    testimonials: t('collections.testimonials'),
    skills: t('collections.skills'),
    technologies: t('collections.technologies'),
    organizations: t('collections.organizations'),
    taxonomies: t('collections.taxonomies'),
    media: t('collections.media'),
    profiles: t('collections.profiles'),
  } as const
}
export type Collection = keyof ReturnType<typeof getCollectionLabels>
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
export function getSections() {
  return [
    ['essential', t('sections.essential'), t('sections.essentialHint')],
    ['context', t('sections.context'), t('sections.contextHint')],
    ['contribution', t('sections.contribution'), t('sections.contributionHint')],
    ['expertise', t('sections.expertise'), t('sections.expertiseHint')],
    ['media', t('sections.media'), t('sections.mediaHint')],
    ['review', t('sections.review'), t('sections.reviewHint')],
  ] as const
}
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
export function getStatusLabels() {
  return { draft: t('status.draft'), ready: t('status.ready'), archived: t('status.archived') }
}
export function getOptionLabels(): Record<string, string> {
  return {
    professional: t('options.professional'),
    personal: t('options.personal'),
    association: t('options.association'),
    academic: t('options.academic'),
    planned: t('options.planned'),
    active: t('options.active'),
    completed: t('options.completed'),
    paused: t('options.paused'),
    private: t('options.private'),
    public: t('options.public'),
    onsite: t('options.onsite'),
    hybrid: t('options.hybrid'),
    remote: t('options.remote'),
    flexible: t('options.flexible'),
    employment: t('options.employment'),
    freelance: t('options.freelance'),
    internship: t('options.internship'),
    apprenticeship: t('options.apprenticeship'),
    volunteer: t('options.volunteer'),
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
    dated: t('options.dated'),
    never: t('options.never'),
    unknown: t('options.unknown'),
    quote: t('pricing.quote'),
    fixed: t('pricing.fixed'),
    from: t('pricing.fromLabel'),
    hour: t('pricing.hour'),
    day: t('pricing.day'),
    talk: t('options.talk'),
    podcast: t('options.podcast'),
    interview: t('options.interview'),
    external_article: t('options.externalArticle'),
    book: t('options.book'),
    other: t('options.other'),
    pending: t('status.pending'),
    granted: t('options.granted'),
    refused: t('options.refused'),
    employer: t('options.employer'),
    client: t('options.client'),
    school: t('options.school'),
    issuer: t('options.issuer'),
    publisher: t('options.publisher'),
    project_category: t('options.projectCategory'),
    post_category: t('options.postCategory'),
    skill_domain: t('options.skillDomain'),
    tag: t('options.crossTag'),
    image: t('options.image'),
    video: t('options.video'),
    document: t('options.document'),
    external: t('options.external'),
    file: t('options.file'),
    cover: t('options.cover'),
    gallery: t('options.gallery'),
    attachment: t('options.attachment'),
    private_proof: t('options.privateProof'),
    share: t('options.share'),
    website: t('options.website'),
    repository: t('options.repository'),
    demo: t('options.demo'),
    documentation: t('options.documentation'),
    article: t('options.article'),
  }
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
