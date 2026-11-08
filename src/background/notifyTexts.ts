import { createI18n } from '@zairakai/js-i18n'
import type { StoredLanguage } from '../customLanguage'
import { merged, pluralCategory, pluralText, resolveIn } from '../localeCore'
import { NOTIFY, SHIPPED } from '../shipped'

// The texts of the notifications, for the background. It has the small file of each language of the extension and nothing of
// the texts of the pages. A language the user added (or one that replaces a language of the extension in the developer
// mode) brings its own `notify` texts, over the English ones.
export function notifyTranslator(languages: readonly StoredLanguage[], setting: string, browserLanguage: string) {
  const own = Object.fromEntries(
    languages.map((language) => [
      language.code,
      {
        notify: merged(
          NOTIFY.en ?? {},
          ((language.messages as Record<string, unknown>).notify as Record<string, unknown> | undefined) ?? {}
        ),
      },
    ])
  )
  const locale = resolveIn([...SHIPPED, ...languages.map((language) => language.code)], setting, browserLanguage)
  const translator = createI18n(
    {
      ...Object.fromEntries(Object.entries(NOTIFY).map(([code, texts]) => [code, { notify: texts }])),
      ...own,
    } as never,
    locale
  )
  return { translator, locale }
}

// One text of every plural form the language has, for a test: the counts are those that tell the forms apart in the languages
// that have the most (zero, one, two, few, many, other).
export function sampleCounts(locale: string): number[] {
  const seen = new Map<string, number>()
  for (const count of [0, 1, 2, 3, 5, 6, 11, 21, 100, 101, 102, 1000000]) {
    const category = pluralCategory(locale, count)
    if (!seen.has(category)) {
      seen.set(category, count)
    }
  }
  return [...seen.values()]
}

export { pluralText }
