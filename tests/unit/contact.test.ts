import { describe, expect, it } from 'vitest'
import {
  countryName,
  formatPhone,
  isCountry,
  languageName,
  listCountries,
  normalizeCountry,
  normalizeEmail,
  normalizeLanguage,
  normalizeLinkedIn,
  normalizePhone,
  regionOf,
  resolveCountry,
} from '../../src/utils/contact'

describe('phone numbers', () => {
  it('reads a number typed in the national format, in the default country', () => {
    expect(normalizePhone('06 12 34 56 78', 'FR')).toEqual({
      e164: '+33612345678',
      international: '+33 6 12 34 56 78',
      national: '06 12 34 56 78',
      country: 'FR',
    })
  })

  it('reads the same number whatever the way it was typed', () => {
    for (const text of [
      '+33 6 12 34 56 78',
      '+33612345678',
      '0033 6 12 34 56 78',
      '06.12.34.56.78',
      '(0)6 12 34 56 78',
    ]) {
      expect(normalizePhone(text, 'FR')?.e164).toBe('+33612345678')
    }
  })

  it('does not take the default country when the number has its own', () => {
    expect(normalizePhone('+1 415 555 2671', 'FR')?.e164).toBe('+14155552671')
    expect(normalizePhone('+44 20 7946 0958', 'FR')?.country).toBe('GB')
  })

  it('refuses a number that is not one, or a national number with no country to read it in', () => {
    expect(normalizePhone('12345', 'FR')).toBeNull()
    expect(normalizePhone('hello', 'FR')).toBeNull()
    expect(normalizePhone('06 12 34 56 78')).toBeNull()
    expect(normalizePhone('   ', 'FR')).toBeNull()
  })

  it('shows a stored number in the style asked', () => {
    expect(formatPhone('+33612345678')).toBe('+33 6 12 34 56 78')
    expect(formatPhone('+33612345678', 'national')).toBe('06 12 34 56 78')
    expect(formatPhone('+33612345678', 'e164')).toBe('+33612345678')
    expect(formatPhone('not a number')).toBe('not a number')
  })
})

describe('emails', () => {
  it('puts an address in lower case', () => {
    expect(normalizeEmail('  Ada.Lovelace@Example.COM ')).toBe('ada.lovelace@example.com')
  })

  it('refuses what is not an address', () => {
    for (const text of ['', 'ada', 'ada@', '@example.com', 'ada@example', 'ada lovelace@example.com', 'a@b@c.com']) {
      expect(normalizeEmail(text)).toBeNull()
    }
  })
})

describe('LinkedIn pages', () => {
  it.each([
    ['https://www.linkedin.com/in/ada-lovelace/', 'https://www.linkedin.com/in/ada-lovelace'],
    ['linkedin.com/in/Ada-Lovelace', 'https://www.linkedin.com/in/ada-lovelace'],
    ['http://fr.linkedin.com/in/ada-lovelace?trk=x#top', 'https://www.linkedin.com/in/ada-lovelace'],
    ['https://m.linkedin.com/in/ada-lovelace', 'https://www.linkedin.com/in/ada-lovelace'],
    ['ada-lovelace', 'https://www.linkedin.com/in/ada-lovelace'],
    ['@ada-lovelace', 'https://www.linkedin.com/in/ada-lovelace'],
    ['https://www.linkedin.com/company/acme/', 'https://www.linkedin.com/company/acme'],
  ])('%s is %s', (input, expected) => {
    expect(normalizeLinkedIn(input)).toBe(expected)
  })

  it('refuses what is not a LinkedIn page', () => {
    for (const text of [
      '',
      'https://example.com/in/ada',
      'https://www.linkedin.com/',
      'https://www.linkedin.com/feed/',
      'a b c',
    ]) {
      expect(normalizeLinkedIn(text)).toBeNull()
    }
  })
})

describe('countries and languages', () => {
  it('knows the countries', () => {
    expect(isCountry('FR')).toBe(true)
    expect(isCountry('fr')).toBe(false)
    expect(isCountry('ZZ')).toBe(false)
    expect(listCountries()).toContain('JP')
  })

  it('reads a country as typed', () => {
    expect(normalizeCountry(' fr ')).toBe('FR')
    expect(normalizeCountry('France')).toBeNull()
  })

  it('names a country in a language', () => {
    expect(countryName('DE', 'en')).toBe('Germany')
    expect(countryName('DE', 'fr')).toBe('Allemagne')
  })

  it('finds the country of a language tag', () => {
    expect(regionOf('fr-CA')).toBe('CA')
    expect(regionOf('fr')).toBe('FR')
    expect(regionOf('en')).toBe('US')
    expect(regionOf('???')).toBeNull()
  })

  it('resolves "auto" from the language of the browser, and takes a chosen country as it is', () => {
    expect(resolveCountry('auto', 'fr-FR')).toBe('FR')
    expect(resolveCountry('DE', 'fr-FR')).toBe('DE')
    expect(resolveCountry('XX', 'fr-FR')).toBeUndefined()
  })

  it('puts a language tag in its canonical form, and refuses what is not one', () => {
    expect(normalizeLanguage('FR-ca')).toBe('fr-CA')
    expect(normalizeLanguage(' en ')).toBe('en')
    expect(normalizeLanguage('not a tag!')).toBeNull()
  })

  it('names a language in a language', () => {
    expect(languageName('fr', 'en')).toBe('French')
    expect(languageName('fr-CA', 'en')).toMatch(/Canadian French|French \(Canada\)/)
  })
})
