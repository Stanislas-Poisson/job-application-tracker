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

// The plural categories of the language (CLDR): zero, one, two, few, many, other. English and French have one and other
// (French also has many for large round numbers), Russian one, few, many and other, Arabic all six.
export const pluralCategory = (locale: string, count: number): Intl.LDMLPluralRule =>
  new Intl.PluralRules(locale).select(count)

/**
 * The text of a key for a number: `path.one`, `path.few`… by the category of the language, else `path.other`. The number
 * is written in the language ({count}), with its digits.
 */
export function pluralText(
  translator: Pick<ReturnType<typeof createTranslator>, '__' | 'hasTranslation'>,
  locale: string,
  path: string,
  count: number,
  replacements: Record<string, string | number> = {}
): string {
  const category = pluralCategory(locale, count)
  const key = translator.hasTranslation(`${path}.${category}`) ? `${path}.${category}` : `${path}.other`
  return translator.__(key, { ...replacements, count: new Intl.NumberFormat(locale).format(count) })
}
