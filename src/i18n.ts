import { createI18n } from '@zairakai/js-i18n'
import en from './locales/en'
import fr from './locales/fr'
import type { Locale } from './settings'

export const SUPPORTED = ['en', 'fr'] as const

// "auto" follows the language of the browser, and falls back to English.
export function resolveLocale(setting: Locale, browserLanguage: string): 'en' | 'fr' {
  if ('auto' !== setting) {
    return setting
  }
  const language = browserLanguage.slice(0, 2).toLowerCase()
  return (SUPPORTED as readonly string[]).includes(language) ? (language as 'en' | 'fr') : 'en'
}

export function createTranslator(setting: Locale = 'auto', browserLanguage: string = navigator.language) {
  return createI18n({ en, fr }, resolveLocale(setting, browserLanguage))
}
