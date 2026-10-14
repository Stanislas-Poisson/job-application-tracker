import { createI18n } from '@zairakai/js-i18n'
import { ref } from 'vue'
import { installed } from './customLanguages'
import { merged, pluralCategory, pluralText, resolveIn } from './localeCore'
import en from './locales/en'
import type { Locale } from './settings'
import { SHIPPED } from './shipped'
import { readShipped } from './shippedLocales'

export const SUPPORTED = SHIPPED

// Every language the extension can show: the ones it has, and the ones the user added from a file.
export const availableLocales = (): string[] => [...SUPPORTED, ...installed.value.map((language) => language.code)]

export const resolveLocale = (setting: Locale, browserLanguage: string): string =>
  resolveIn(availableLocales(), setting, browserLanguage)

const customMessages = () =>
  Object.fromEntries(installed.value.map((language) => [language.code, merged(en, language.messages)]))

export function createTranslator(setting: Locale = 'auto', browserLanguage: string = navigator.language) {
  // Only English is in it: the language in use is read by loadLocale(), which a page waits for before it draws.
  return createI18n({ en, ...customMessages() } as never, resolveLocale(setting, browserLanguage))
}

// Changes when a language has been read, so that the texts that were drawn in English meanwhile are drawn again.
export const loadedLanguages = ref(0)
const reading = new WeakMap<object, Set<string>>()

// Gives a translator the texts of a language the extension comes with, reading them from the extension the first time.
// Nothing is read for English, for a language the user added, or for one that is there already.
export async function loadLocale(translator: ReturnType<typeof createTranslator>, locale: string): Promise<void> {
  const read = readShipped(locale)
  const busy = reading.get(translator) ?? new Set<string>()
  reading.set(translator, busy)
  if (!read || busy.has(locale) || translator.getAvailableLocales().includes(locale)) {
    return
  }
  busy.add(locale)
  try {
    translator.setTranslations(locale, (await read) as never)
    loadedLanguages.value++
  } finally {
    busy.delete(locale)
  }
}

// The language a translator can speak now: the one asked for once it is read, English until then.
export function speakable(translator: ReturnType<typeof createTranslator>, locale: string): string {
  void loadedLanguages.value
  if (translator.getAvailableLocales().includes(locale)) {
    return locale
  }
  void loadLocale(translator, locale)
  return 'en'
}

// Gives a translator the texts of a language added after it was made.
export function ensureLocale(translator: ReturnType<typeof createTranslator>, locale: string) {
  const language = installed.value.find((candidate) => candidate.code === locale)
  if (language && !translator.getAvailableLocales().includes(locale)) {
    translator.setTranslations(locale, merged(en, language.messages) as never)
  }
}

export { pluralCategory, pluralText }
