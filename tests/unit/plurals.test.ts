import { createI18n } from '@zairakai/js-i18n'
import { describe, expect, it } from 'vitest'
import { pluralCategory, pluralText } from '../../src/i18n'
import en from '../../src/locales/en'
import fr from '../../src/locales/fr'
import frNotify from '../../src/locales/notify/fr'

describe('plural categories', () => {
  it('follow the rules of each language', () => {
    expect([0, 1, 2, 5].map((n) => pluralCategory('en', n))).toEqual(['other', 'one', 'other', 'other'])
    // In French 0 and 1 are singular.
    expect([0, 1, 2].map((n) => pluralCategory('fr', n))).toEqual(['one', 'one', 'other'])
    // Russian: one, few, many.
    expect([1, 2, 5, 21, 22, 25].map((n) => pluralCategory('ru', n))).toEqual([
      'one',
      'few',
      'many',
      'one',
      'few',
      'many',
    ])
    // Arabic has six.
    expect([0, 1, 2, 3, 11, 100].map((n) => pluralCategory('ar', n))).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'many',
      'other',
    ])
  })
})

describe('pluralText', () => {
  const russian = createI18n(
    { ru: { files: { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' } } },
    'ru'
  )
  const arabic = createI18n({ ar: { files: { one: 'ملف', other: '{count} ملفات' } } }, 'ar')

  it('picks the form of the language, and falls back to "other" for a form the texts do not have', () => {
    expect([1, 2, 5, 21].map((n) => pluralText(russian, 'ru', 'files', n))).toEqual([
      '1 файл',
      '2 файла',
      '5 файлов',
      '21 файл',
    ])
    // Arabic "two" is not written: "other" is used.
    expect(pluralText(arabic, 'ar', 'files', 2)).toMatch(/ملفات/)
  })

  it('writes the number with the digits of the language', () => {
    expect(pluralText(arabic, 'ar-EG', 'files', 12)).toContain('١٢')
  })

  it('has one and other for every counted text of English and French', () => {
    const counted = (messages: unknown, path: string[] = []): string[] =>
      Object.entries(messages as Record<string, unknown>).flatMap(([key, value]) =>
        'object' === typeof value && null !== value
          ? 'one' in value && 'other' in value
            ? [[...path, key].join('.')]
            : counted(value, [...path, key])
          : []
      )
    const inEnglish = counted(en)
    expect(inEnglish.length).toBe(9)
    // The texts of the notifications are in a file of their own.
    expect(counted({ ...fr, notify: frNotify }).sort()).toEqual([...inEnglish].sort())
  })
})
