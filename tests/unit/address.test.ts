import { describe, expect, it } from 'vitest'
import {
  addressFromSchema,
  countryFromName,
  emptyAddress,
  formatAddress,
  formatCoordinates,
  hasAddress,
  hasCoordinates,
  normalizeAddress,
  parseCoordinates,
} from '../../src/services/address'

const address = (changes: Partial<ReturnType<typeof emptyAddress>> = {}) => ({ ...emptyAddress(), ...changes })

describe('normalizeAddress', () => {
  it('trims the text, keeps a country that is a code, and a pair of coordinates', () => {
    expect(
      normalizeAddress({
        line1: '  5 avenue  de l’Opéra ',
        city: ' Lyon ',
        postalCode: '69001',
        country: 'fr',
        latitude: 45.76,
        longitude: 4.83,
      })
    ).toEqual(
      address({
        line1: '5 avenue de l’Opéra',
        city: 'Lyon',
        postalCode: '69001',
        country: 'FR',
        latitude: 45.76,
        longitude: 4.83,
      })
    )
  })

  it('drops what is not allowed instead of repairing it', () => {
    const result = normalizeAddress({ country: 'France', latitude: 91, longitude: 4, line1: 42, city: null })
    expect(result).toEqual(address())
    // A coordinate alone is no position.
    expect(normalizeAddress({ country: 'Germany' }).country).toBe('')
    expect(normalizeAddress({ country: 'FRA' }).country).toBe('')
    expect(normalizeAddress({ latitude: 45, longitude: null })).toEqual(address())
    expect(normalizeAddress({ latitude: 45, longitude: 181 })).toEqual(address())
    expect(normalizeAddress({ latitude: 'x', longitude: 4 })).toEqual(address())
    expect(normalizeAddress(null)).toEqual(address())
    expect(normalizeAddress('text')).toEqual(address())
  })

  it('cuts what is far too long', () => {
    expect(normalizeAddress({ line1: 'x'.repeat(500) }).line1).toHaveLength(200)
    expect(normalizeAddress({ postalCode: '1'.repeat(40) }).postalCode).toHaveLength(20)
  })
})

describe('hasAddress and hasCoordinates', () => {
  it('say whether there is anything to look up', () => {
    expect(hasAddress(address())).toBe(false)
    expect(hasAddress(address({ country: 'FR', region: 'Normandie' }))).toBe(false)
    expect(hasAddress(address({ line1: '1 rue X' }))).toBe(true)
    expect(hasAddress(address({ city: 'Paris' }))).toBe(true)
    expect(hasAddress(address({ latitude: 1, longitude: 2 }))).toBe(true)
    expect(hasCoordinates(address({ latitude: 0, longitude: 0 }))).toBe(true)
    expect(hasCoordinates(address({ latitude: 1 }))).toBe(false)
  })
})

describe('formatAddress', () => {
  it('writes the postal code before the city, as in France and Germany', () => {
    expect(
      formatAddress(address({ line1: "5 avenue de l'Opéra", postalCode: '69001', city: 'Lyon', country: 'FR' }), 'en')
    ).toBe("5 avenue de l'Opéra, 69001 Lyon, France")
    expect(
      formatAddress(address({ line1: 'Unter den Linden 1', postalCode: '10117', city: 'Berlin', country: 'DE' }), 'de')
    ).toBe('Unter den Linden 1, 10117 Berlin, Deutschland')
  })

  it('writes the country in the language given', () => {
    const lyon = address({ line1: '5 rue X', postalCode: '69001', city: 'Lyon', country: 'DE' })
    expect(formatAddress(lyon, 'fr')).toBe('5 rue X, 69001 Lyon, Allemagne')
  })

  it('puts the postal code after the city in the United Kingdom, and the region between in the United States', () => {
    expect(
      formatAddress(
        address({ line1: '10 Downing Street', city: 'London', postalCode: 'SW1A 2AA', country: 'GB' }),
        'en'
      )
    ).toBe('10 Downing Street, London, SW1A 2AA, United Kingdom')
    expect(
      formatAddress(
        address({ line1: '1 Main St', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' }),
        'en'
      )
    ).toBe('1 Main St, Austin, TX 78701, United States')
  })

  it('keeps the three lines in order, and leaves out what is missing', () => {
    expect(formatAddress(address({ line1: 'Building A', line2: 'Floor 3', line3: 'Office 12', city: 'Paris' }))).toBe(
      'Building A, Floor 3, Office 12, Paris'
    )
    expect(formatAddress(address({ city: 'Nice', region: 'PACA' }))).toBe('Nice, PACA')
    expect(formatAddress(address())).toBe('')
    expect(formatAddress(address({ country: 'FR' }), 'en')).toBe('France')
  })

  it('does not say twice what the lines already say', () => {
    // A page may give the whole address as its street.
    const whole = address({
      line1: '18 Place des Reflets, 92400 Courbevoie, France',
      postalCode: '92400',
      city: 'Courbevoie',
      country: 'FR',
    })
    expect(formatAddress(whole, 'en')).toBe('18 Place des Reflets, 92400 Courbevoie, France')
    expect(formatAddress(address({ line1: '1 rue X, Paris', city: 'Paris', postalCode: '75001' }))).toBe(
      '1 rue X, Paris'
    )
  })
})

describe('parseCoordinates', () => {
  it('reads the two numbers a map gives, however they are written', () => {
    const expected = { latitude: 47.3941, longitude: 0.6848 }
    expect(parseCoordinates('47.3941, 0.6848')).toEqual(expected)
    expect(parseCoordinates('47.3941 0.6848')).toEqual(expected)
    expect(parseCoordinates('47,3941; 0,6848')).toEqual(expected)
    expect(parseCoordinates('  47.3941,0.6848  ')).toEqual(expected)
    expect(parseCoordinates('-33.8688, 151.2093')).toEqual({ latitude: -33.8688, longitude: 151.2093 })
    expect(parseCoordinates('45, -73')).toEqual({ latitude: 45, longitude: -73 })
  })

  it('refuses what is not a pair in range', () => {
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('47.39')).toBeNull()
    expect(parseCoordinates('1, 2, 3')).toBeNull()
    expect(parseCoordinates('91, 0')).toBeNull()
    expect(parseCoordinates('0, 181')).toBeNull()
    expect(parseCoordinates('north, east')).toBeNull()
  })

  it('is written back the way it is read', () => {
    const position = { latitude: 47.3941, longitude: 0.6848 }
    expect(formatCoordinates(position)).toBe('47.3941, 0.6848')
    expect(parseCoordinates(formatCoordinates(position))).toEqual(position)
    expect(formatCoordinates({ latitude: null, longitude: null })).toBe('')
  })
})

describe('countryFromName', () => {
  it('finds a country by its name in English or French, or by its code', () => {
    expect(countryFromName('France')).toBe('FR')
    expect(countryFromName('germany')).toBe('DE')
    expect(countryFromName('Allemagne')).toBe('DE')
    expect(countryFromName('fr')).toBe('FR')
    expect(countryFromName('Narnia')).toBe('')
    expect(countryFromName('  ')).toBe('')
  })
})

describe('addressFromSchema', () => {
  it('takes the parts a page gives, and its position', () => {
    expect(
      addressFromSchema(
        {
          streetAddress: '1 rue X',
          postalCode: '75001',
          addressLocality: 'Paris',
          addressRegion: 'Île-de-France',
          addressCountry: 'FR',
        },
        { latitude: 48.86, longitude: 2.34 }
      )
    ).toEqual(
      address({
        line1: '1 rue X',
        postalCode: '75001',
        city: 'Paris',
        region: 'Île-de-France',
        country: 'FR',
        latitude: 48.86,
        longitude: 2.34,
      })
    )
  })

  it('reads a country given by its name, as a code, and one given as an object', () => {
    expect(addressFromSchema({ addressCountry: 'France' }, null).country).toBe('FR')
    expect(addressFromSchema({ addressCountry: { name: 'Allemagne' } }, undefined).country).toBe('DE')
    expect(addressFromSchema({ addressCountry: 'Narnia' }, null).country).toBe('')
  })

  it('reads a position given as strings, and none from a half pair', () => {
    expect(addressFromSchema({}, { latitude: '48.86', longitude: '2.34' })).toMatchObject({
      latitude: 48.86,
      longitude: 2.34,
    })
    expect(addressFromSchema({}, { latitude: 48.86 })).toMatchObject({ latitude: null, longitude: null })
    expect(addressFromSchema(null, null)).toEqual(address())
  })
})
