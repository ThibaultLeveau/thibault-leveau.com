import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './locales/fr.json'
import en from './locales/en.json'

export type Language = 'fr' | 'en'
type PluralBase<Key> = Key extends `${infer Base}_${'one' | 'other' | 'many'}` ? Base : Key
export type MessageKey = PluralBase<keyof typeof fr>
export const languages = ['fr', 'en'] as const
export const isLanguage = (value: unknown): value is Language =>
  value === 'fr' || value === 'en'

export const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: document.documentElement.lang === 'en' ? 'en' : 'fr',
  fallbackLng: 'fr',
  supportedLngs: languages,
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes text and attributes.
})

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
  document.documentElement.lang = value
  document.documentElement.dataset.interfaceLanguage = value
  await i18n.changeLanguage(value)
}
