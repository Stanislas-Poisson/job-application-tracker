import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHIPPED } from '../../src/customLanguage'
import { createTranslator, loadLocale, resolveLocale } from '../../src/i18n'
import { LANGUAGES } from '../../src/languages'
import en from '../../src/locales/en'

// Every language but English, read the way the extension reads them (one file each), so that a file added is tested without
// being listed here.
const files = import.meta.glob<{ default: Record<string, unknown> }>(
  ['../../src/locales/*.ts', '!../../src/locales/en.ts'],
  {
    eager: true,
  }
)
const notifyFiles = import.meta.glob<{ default: Record<string, unknown> }>('../../src/locales/notify/*.ts', {
  eager: true,
})
const NOTIFY = Object.fromEntries(
  Object.entries(notifyFiles).map(([path, module]) => [path.replace(/^.*\/(.+)\.ts$/, '$1'), module.default])
) as Record<string, Record<string, unknown>>

// The texts of the notifications are in a file of their own for each language; the other files do not have them, English
// (which is the template of a language file) has them through its own.
const withoutNotify = (messages: Record<string, unknown>): Record<string, unknown> => {
  const { notify: _notify, ...rest } = messages
  return rest
}

const OTHERS = Object.fromEntries(
  Object.entries(files).map(([path, module]) => [path.replace(/^.*\/(.+)\.ts$/, '$1'), module.default])
) as Record<string, unknown>

const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other']

// A text with plural forms: an object with an "other" form and no key that is not a plural category (a list of choices can
// have a key named "other" too, as the means of a journey does).
const isPlural = (value: unknown): value is Record<string, string> =>
  'object' === typeof value &&
  null !== value &&
  'other' in value &&
  Object.keys(value).every((key) => CATEGORIES.includes(key)) &&
  Object.values(value).every((text) => 'string' === typeof text)

// Every dotted path of a translation file. A text with plural forms counts as one text: each language has the forms of its own.
function paths(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    'object' === typeof value && null !== value && !isPlural(value)
      ? paths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
}

const valueAt = (object: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], object)

// The {placeholders} of a text, or of all the forms of a text with plurals.
const placeholders = (value: unknown): string[] => {
  const texts = isPlural(value) ? Object.values(value) : [String(value)]
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '')))].sort()
}

describe('translations', () => {
  it('has the same keys in every language as in English', () => {
    for (const [code, messages] of Object.entries(OTHERS)) {
      expect(paths(messages as Record<string, unknown>).sort(), code).toEqual(
        paths(withoutNotify(en as Record<string, unknown>)).sort()
      )
    }
  })

  it('has the texts of the notifications in every language, with the same keys and placeholders as English', () => {
    expect(Object.keys(NOTIFY).sort()).toEqual([...SHIPPED].sort())
    expect(en.notify).toEqual(NOTIFY.en)
    for (const [code, texts] of Object.entries(NOTIFY)) {
      expect(paths(texts).sort(), code).toEqual(paths(NOTIFY.en ?? {}).sort())
      for (const path of paths(NOTIFY.en ?? {})) {
        expect(placeholders(valueAt(texts, path)), `${code} ${path}`).toEqual(
          placeholders(valueAt(NOTIFY.en ?? {}, path))
        )
      }
    }
  })

  it('lists the languages it comes with in one place, and the table matches the files', () => {
    expect(LANGUAGES.map((language) => language.code).sort()).toEqual([...SHIPPED].sort())
    expect(Object.keys(OTHERS).concat('en').sort()).toEqual([...SHIPPED].sort())
  })

  it('has the same placeholders in every language as in English, and a plural text has an "other" form', () => {
    for (const path of paths(withoutNotify(en as Record<string, unknown>))) {
      const english = valueAt(en as Record<string, unknown>, path)
      for (const [code, messages] of Object.entries(OTHERS)) {
        const other = valueAt(messages as Record<string, unknown>, path)
        expect(placeholders(other), `${code} ${path}`).toEqual(placeholders(english))
        expect(isPlural(english) === isPlural(other), `${code} ${path}`).toBe(true)
      }
    }
  })

  it('has a name, a description and the names of the keys of the browser in each language, with the same keys as the default', () => {
    const read = (lang: string) =>
      JSON.parse(readFileSync(`public/_locales/${lang}/messages.json`, 'utf8')) as Record<string, { message: string }>
    const keys = Object.keys(read('en')).sort()
    expect(keys).toEqual(['commandBoard', 'commandPopup', 'extDescription', 'extName', 'extShortName'])
    for (const lang of readdirSync('public/_locales')) {
      expect(Object.keys(read(lang)).sort()).toEqual(keys)
      expect(read(lang).extDescription?.message.length).toBeGreaterThan(20)
      expect(read(lang).extDescription?.message.length).toBeLessThanOrEqual(132)
    }
  })

  it('has no empty text', () => {
    const translator = createTranslator('en', 'en')
    for (const path of paths(withoutNotify(en as Record<string, unknown>))) {
      expect(translator.__(path)).not.toBe('')
    }
  })

  it('has the plural forms its language needs in every text that has them, and no empty text', () => {
    for (const [code, messages] of Object.entries(OTHERS)) {
      // The forms the language has for whole numbers: Japanese has one, English two, Hebrew three, Russian four, Arabic six.
      const rules = new Intl.PluralRules(code)
      const needed = [...new Set(Array.from({ length: 201 }, (_, count) => rules.select(count)))]
      for (const path of paths(messages as Record<string, unknown>)) {
        const value = valueAt(messages as Record<string, unknown>, path)
        if (isPlural(value)) {
          expect(Object.keys(value), `${code} ${path}`).toEqual(expect.arrayContaining(needed))
        }
        const texts = isPlural(value) ? Object.values(value) : [String(value)]
        for (const text of texts) {
          expect(text.trim(), `${code} ${path}`).not.toBe('')
        }
      }
    }
  })

  it('follows the language of the browser, with English as the fallback', () => {
    expect(resolveLocale('auto', 'fr-FR')).toBe('fr')
    expect(resolveLocale('auto', 'de-DE')).toBe('de')
    expect(resolveLocale('auto', 'pt-BR')).toBe('pt')
    expect(resolveLocale('auto', 'is-IS')).toBe('en')
    expect(resolveLocale('fr', 'en-US')).toBe('fr')
  })

  it('finds the language of the browser by its script or its region, down to the language', () => {
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh-Hans')
    expect(resolveLocale('auto', 'zh')).toBe('zh-Hans')
    expect(resolveLocale('auto', 'zh-SG')).toBe('zh-Hans')
    expect(resolveLocale('auto', 'zh-Hans-CN')).toBe('zh-Hans')
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh-Hant')
    expect(resolveLocale('auto', 'zh-HK')).toBe('zh-Hant')
    expect(resolveLocale('auto', 'zh-Hant-TW')).toBe('zh-Hant')
    expect(resolveLocale('auto', 'he-IL')).toBe('he')
    expect(resolveLocale('auto', 'ja-JP')).toBe('ja')
  })

  it('translates once the language is read, and speaks English until then', async () => {
    const spanish = createTranslator('es', 'en')
    expect(spanish.__('nav.board')).not.toBe('Tablero')
    await loadLocale(spanish, 'es')
    expect(spanish.__('nav.board')).toBe('Tablero')
    for (const [code, text] of [
      ['ar', 'اللوحة'],
      ['fr', 'Tableau'],
    ] as const) {
      const translator = createTranslator(code, 'en')
      await loadLocale(translator, code)
      expect(translator.__('nav.board')).toBe(text)
    }
    expect(createTranslator('en', 'fr').__('nav.board')).toBe('Board')
  })

  it('reads a language once and keeps English in the page without reading it', async () => {
    const translator = createTranslator('fr', 'en')
    expect(translator.getAvailableLocales()).toEqual(['en'])
    await Promise.all([loadLocale(translator, 'fr'), loadLocale(translator, 'fr'), loadLocale(translator, 'en')])
    expect(translator.getAvailableLocales().sort()).toEqual(['en', 'fr'])
  })
})
