import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../src/languages'
import { translationReportUrl } from '../../src/services/translationReport'

describe('translationReportUrl', () => {
  it('opens the form of a translation issue with the language, and holds nothing else', () => {
    const url = new URL(translationReportUrl('es'))
    expect(url.origin + url.pathname).toBe('https://github.com/Stanislas-Poisson/job-application-tracker/issues/new')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'translation.yml',
      title: '[Translation] es',
      language: 'es',
    })
  })
})

describe('languages', () => {
  it('say which were checked by a person who speaks them', () => {
    const reviewed = LANGUAGES.filter((language) => language.reviewed).map((language) => language.code)
    expect(reviewed).toEqual(['en', 'fr'])
  })

  it('write the language of the right to the left from the right', () => {
    expect(LANGUAGES.find((language) => 'ar' === language.code)?.dir).toBe('rtl')
  })
})
