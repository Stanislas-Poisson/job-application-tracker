import { describe, expect, it } from 'vitest'
import { createTranslator, resolveLocale } from '../../src/i18n'
import en from '../../src/locales/en'
import fr from '../../src/locales/fr'

// Every dotted path of a translation file.
function paths(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    'object' === typeof value && null !== value
      ? paths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
}

describe('translations', () => {
  it('has the same keys in English and in French', () => {
    expect(paths(fr as Record<string, unknown>).sort()).toEqual(paths(en as Record<string, unknown>).sort())
  })

  it('has no empty text', () => {
    const translator = createTranslator('en', 'en')
    for (const path of paths(en as Record<string, unknown>)) {
      expect(translator.__(path)).not.toBe('')
    }
  })

  it('follows the language of the browser, with English as the fallback', () => {
    expect(resolveLocale('auto', 'fr-FR')).toBe('fr')
    expect(resolveLocale('auto', 'de-DE')).toBe('en')
    expect(resolveLocale('fr', 'en-US')).toBe('fr')
  })

  it('translates', () => {
    expect(createTranslator('fr', 'en').__('nav.board')).toBe('Tableau')
    expect(createTranslator('en', 'fr').__('nav.board')).toBe('Board')
  })
})
