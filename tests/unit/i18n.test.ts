import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHIPPED } from '../../src/customLanguage'
import { createTranslator, resolveLocale } from '../../src/i18n'
import { LANGUAGES } from '../../src/languages'
import ar from '../../src/locales/ar'
import de from '../../src/locales/de'
import en from '../../src/locales/en'
import es from '../../src/locales/es'
import fr from '../../src/locales/fr'
import it2 from '../../src/locales/it'
import nl from '../../src/locales/nl'
import pt from '../../src/locales/pt'

const OTHERS = { fr, es, de, it: it2, nl, pt, ar } as Record<string, unknown>

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
        paths(en as Record<string, unknown>).sort()
      )
    }
  })

  it('lists the languages it comes with in one place, and the table matches the files', () => {
    expect(LANGUAGES.map((language) => language.code).sort()).toEqual([...SHIPPED].sort())
    expect(Object.keys(OTHERS).concat('en').sort()).toEqual([...SHIPPED].sort())
  })

  it('has the same placeholders in every language as in English, and a plural text has an "other" form', () => {
    for (const path of paths(en as Record<string, unknown>)) {
      const english = valueAt(en as Record<string, unknown>, path)
      for (const [code, messages] of Object.entries(OTHERS)) {
        const other = valueAt(messages as Record<string, unknown>, path)
        expect(placeholders(other), `${code} ${path}`).toEqual(placeholders(english))
        expect(isPlural(english) === isPlural(other), `${code} ${path}`).toBe(true)
      }
    }
  })

  it('has a name and a description of the store listing in each language, with the same keys as the default', () => {
    const read = (lang: string) =>
      JSON.parse(readFileSync(`public/_locales/${lang}/messages.json`, 'utf8')) as Record<string, { message: string }>
    const keys = Object.keys(read('en')).sort()
    expect(keys).toEqual(['extDescription', 'extName', 'extShortName'])
    for (const lang of readdirSync('public/_locales')) {
      expect(Object.keys(read(lang)).sort()).toEqual(keys)
      expect(read(lang).extDescription?.message.length).toBeGreaterThan(20)
      expect(read(lang).extDescription?.message.length).toBeLessThanOrEqual(132)
    }
  })

  it('has no empty text', () => {
    const translator = createTranslator('en', 'en')
    for (const path of paths(en as Record<string, unknown>)) {
      expect(translator.__(path)).not.toBe('')
    }
  })

  it('has the plural forms its language needs in every text that has them, and no empty text', () => {
    for (const [code, messages] of Object.entries(OTHERS)) {
      const needed = 'ar' === code ? ['zero', 'one', 'two', 'few', 'many', 'other'] : ['one', 'other']
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
    expect(resolveLocale('auto', 'ja-JP')).toBe('en')
    expect(resolveLocale('fr', 'en-US')).toBe('fr')
  })

  it('translates', () => {
    expect(createTranslator('es', 'en').__('nav.board')).toBe('Tablero')
    expect(createTranslator('ar', 'en').__('nav.board')).toBe('اللوحة')
    expect(createTranslator('fr', 'en').__('nav.board')).toBe('Tableau')
    expect(createTranslator('en', 'fr').__('nav.board')).toBe('Board')
  })
})
