import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import type fr from './locales/fr.json'
import bootstrap from './bootstrap.json'

export type Language = 'fr' | 'en'
type PluralBase<Key> = Key extends `${infer Base}_${'one' | 'other' | 'many'}` ? Base : Key
export type MessageKey = PluralBase<keyof typeof fr> | keyof typeof bootstrap.fr
export const languages = ['fr', 'en'] as const
export const isLanguage = (value: unknown): value is Language =>
  value === 'fr' || value === 'en'

export const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({
  // Keep only the recovery screen in the entry bundle. Vite emits each full
  // catalog as an immutable asset, loaded before the first application render.
  resources: { fr: { translation: bootstrap.fr }, en: { translation: bootstrap.en } },
  lng: document.documentElement.lang === 'en' ? 'en' : 'fr',
  fallbackLng: 'fr',
  supportedLngs: languages,
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes text and attributes.
})

const catalogs = {
  fr: () => import('./locales/fr.json'),
  en: () => import('./locales/en.json'),
}
const loading = new Map<Language, Promise<void>>()

export function loadLanguage(value: Language): Promise<void> {
  const pending = loading.get(value)
  if (pending) return pending
  const promise = catalogs[value]()
    .then(({ default: messages }) => {
      i18n.addResourceBundle(value, 'translation', messages)
    })
    .catch(() => {
      loading.delete(value)
      throw new Error(t('bootstrap.unavailable'))
    })
  loading.set(value, promise)
  return promise
}

export function t(key: MessageKey, values?: Record<string, string | number>) {
  return i18n.t(key, values ?? {})
}

export function language(): Language {
  return i18n.resolvedLanguage === 'en' ? 'en' : 'fr'
}

export function locale() {
  return language() === 'en' ? 'en-GB' : 'fr-FR'
}

export function number(value: number, fractionDigits?: number) {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export async function changeLanguage(value: Language) {
  await loadLanguage(value)
  await i18n.changeLanguage(value)
  document.documentElement.lang = value
  document.documentElement.dataset.interfaceLanguage = value
}
