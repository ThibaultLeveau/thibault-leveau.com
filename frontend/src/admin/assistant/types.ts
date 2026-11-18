import { t } from '../../i18n'
import type { Collection, FieldError, Item, Value } from '../content/types'

export interface Question {
  question: string
  reason: string
  fields: string[]
}
export interface ProposalItem {
  unmatched_texts?: { path: string; value: string }[]
  language?: 'fr' | 'en'
  key: string
  kind: Collection
  id: number | null
  title: string
  changes: { field: string; label: string; before: Value; after: Value }[]
  status_before: string | null
  status_after: string
  missing: string[]
  errors: FieldError[]
  references: Record<number, Item>
  related: boolean
}
export interface Proposal {
  translation?: boolean
  id: string
  revision: number
  state: 'pending' | 'applied' | 'cancelled' | 'superseded'
  expires: number | null
  items: ProposalItem[]
  result:
    | {
        id: number
        kind: Collection
        title: string
        status: string
        version: number
        language?: 'fr' | 'en'
      }[]
    | null
}
export interface AssistantReply {
  job?: AssistantJob | null
  message: string
  questions: Question[]
  proposal: Proposal | null
  provider: string
  model: string
  calls: number
  delegations: number
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'review'
  | 'needs_input'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'cancelled'

export interface AssistantJob {
  id: string
  status: JobStatus
  language: 'fr' | 'en'
  message: string
  created: number
  updated: number
  planned: number
  prepared: number
  applied: number
  pending_batches: number
  total_tasks: number | null
  calls: number
  delegations: number
  questions: Question[]
  error: string | null
  provider: string
  model: string
  include_private_notes: boolean
}

export interface JobBatch {
  sequence: number
  proposal: Proposal
}

export interface JobPage<T> {
  items: T[]
  page: number
  limit: number
  total: number
}
export function getFamilies() {
  return {
    profile: t('collections.profile'),
    career: t('navigation.career'),
    expertise: t('preferences.projectsExpertise'),
    services: t('collections.services'),
    editorial: t('preferences.writing'),
    library: t('navigation.library'),
  } as const
}
export type Family = keyof ReturnType<typeof getFamilies>
export interface Style {
  language: string
  tone: 'neutral' | 'warm' | 'direct' | 'formal'
  technicality: 'accessible' | 'balanced' | 'expert'
  detail: 'concise' | 'balanced' | 'detailed'
  voice: 'first_person' | 'third_person' | 'impersonal'
  audience: string
  instructions: string
}
export const defaultStyle: Style = {
  language: 'fr',
  tone: 'neutral',
  technicality: 'balanced',
  detail: 'balanced',
  voice: 'first_person',
  audience: '',
  instructions: '',
}
export interface Preferences {
  defaults: Style
  overrides: Partial<Record<Family, Style>>
  version: number
}
