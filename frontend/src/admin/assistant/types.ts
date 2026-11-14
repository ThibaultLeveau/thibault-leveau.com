import { t } from '../../i18n'
import type { Collection, FieldError, Item, Value } from '../content/types'

export interface Question {
  question: string
  reason: string
  fields: string[]
}
export interface ProposalItem {
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
  id: string
  revision: number
  state: 'pending' | 'applied' | 'cancelled' | 'superseded'
  expires: number
  items: ProposalItem[]
  result:
    { id: number; kind: Collection; title: string; status: string; version: number }[] | null
}
export interface AssistantReply {
  message: string
  questions: Question[]
  proposal: Proposal | null
  provider: string
  model: string
  calls: number
  delegations: number
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
