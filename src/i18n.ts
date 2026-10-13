import { createI18n } from '@zairakai/js-i18n'
import en from './locales/en'
import fr from './locales/fr'
import type { Locale } from './settings'

import { installed } from './customLanguages'

export const SUPPORTED = ['en', 'fr'] as const

// Every language the extension can show: the ones it has, and the ones the user added from a file.
export const availableLocales = (): string[] => [...SUPPORTED, ...installed.value.map((language) => language.code)]

// "auto" follows the language of the browser (the exact tag first, then its language), and falls back to English. A language
// that is not there (a file that was removed) is English.
export function resolveLocale(setting: Locale, browserLanguage: string): string {
  const available = availableLocales()
  if ('auto' !== setting) {
    return available.includes(setting) ? setting : 'en'
  }
  const tag = browserLanguage.toLowerCase()
  const exact = available.find((code) => code.toLowerCase() === tag)
  if (exact) {
    return exact
  }
  const language = tag.split('-')[0] ?? ''
  return available.find((code) => code.toLowerCase() === language) ?? 'en'
}

// The texts of a language the user added: English with their texts over it, so that a text they left out is English.
function merged(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(over)) {
    const current = out[key]
    out[key] =
      'object' === typeof value &&
      null !== value &&
      'object' === typeof current &&
      null !== current &&
      !('other' in value)
        ? merged(current as Record<string, unknown>, value as Record<string, unknown>)
        : value
  }
  return out
}

const customMessages = () =>
  Object.fromEntries(installed.value.map((language) => [language.code, merged(en, language.messages)]))

export function createTranslator(setting: Locale = 'auto', browserLanguage: string = navigator.language) {
  return createI18n({ en, fr, ...customMessages() } as never, resolveLocale(setting, browserLanguage))
}

// Gives a translator the texts of a language added after it was made.
export function ensureLocale(translator: ReturnType<typeof createTranslator>, locale: string) {
  const language = installed.value.find((candidate) => candidate.code === locale)
  if (language && !translator.getAvailableLocales().includes(locale)) {
    translator.setTranslations(locale, merged(en, language.messages) as never)
  }
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
