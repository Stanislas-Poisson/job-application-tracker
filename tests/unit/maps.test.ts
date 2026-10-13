import { describe, expect, it } from 'vitest'
import {
  type MapChoice,
  canRoute,
  formatCommute,
  isValidTemplate,
  joinAddress,
  placeLink,
  routeLink,
} from '../../src/services/maps'

const choice = (changes: Partial<MapChoice> = {}): MapChoice => ({
  provider: 'google',
  customTemplate: '',
  mode: 'car',
  ...changes,
})
const HOME = '12 rue de la Paix, 75002 Paris'
const WORK = "5 avenue de l'Opéra & Cie, 69001 Lyon #2"

describe('placeLink', () => {
  it('builds the link of each service, with the address encoded', () => {
    const query = encodeURIComponent(WORK)
    expect(placeLink(WORK, choice())).toBe(`https://www.google.com/maps/search/?api=1&query=${query}`)
    expect(placeLink(WORK, choice({ provider: 'apple' }))).toBe(`https://maps.apple.com/?q=${query}`)
    expect(placeLink(WORK, choice({ provider: 'osm' }))).toBe(`https://www.openstreetmap.org/search?query=${query}`)
  })

  it('keeps an address from changing the link: the & and the # are encoded', () => {
    const link = new URL(placeLink('A & B # C', choice()) as string)
    expect(link.searchParams.get('query')).toBe('A & B # C')
    expect(link.hash).toBe('')
    expect(link.hostname).toBe('www.google.com')
  })

  it('gives nothing for an empty address', () => {
    expect(placeLink('', choice())).toBeNull()
    expect(placeLink('   ', choice({ provider: 'osm' }))).toBeNull()
  })

  it('uses the link of the user when it is usable, and nothing when it is not', () => {
    const template = 'https://maps.example.org/?q={query}'
    expect(placeLink('Paris 1', choice({ provider: 'custom', customTemplate: template }))).toBe(
      'https://maps.example.org/?q=Paris%201'
    )
    expect(placeLink('Paris', choice({ provider: 'custom', customTemplate: 'http://insecure/?q={query}' }))).toBeNull()
    expect(placeLink('Paris', choice({ provider: 'custom', customTemplate: '' }))).toBeNull()
  })
})

describe('routeLink', () => {
  it('builds the route of Google and Apple, in the way of travelling chosen', () => {
    const from = encodeURIComponent(HOME)
    const to = encodeURIComponent(WORK)
    expect(routeLink(HOME, WORK, choice())).toBe(
      `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}&travelmode=driving`
    )
    expect(routeLink(HOME, WORK, choice({ mode: 'transit' }))).toContain('travelmode=transit')
    expect(routeLink(HOME, WORK, choice({ mode: 'bike' }))).toContain('travelmode=bicycling')
    expect(routeLink(HOME, WORK, choice({ mode: 'walk' }))).toContain('travelmode=walking')
    expect(routeLink(HOME, WORK, choice({ provider: 'apple', mode: 'walk' }))).toBe(
      `https://maps.apple.com/?saddr=${from}&daddr=${to}&dirflg=w`
    )
    expect(routeLink(HOME, WORK, choice({ provider: 'apple' }))).toContain('dirflg=d')
    expect(routeLink(HOME, WORK, choice({ provider: 'apple', mode: 'transit' }))).toContain('dirflg=r')
  })

  it('does not make a route for OpenStreetMap, which needs coordinates, and says so', () => {
    expect(canRoute(choice({ provider: 'osm' }))).toBe(false)
    expect(routeLink(HOME, WORK, choice({ provider: 'osm' }))).toBeNull()
    expect(canRoute(choice())).toBe(true)
    expect(canRoute(choice({ provider: 'apple' }))).toBe(true)
  })

  it('needs both addresses', () => {
    expect(routeLink('', WORK, choice())).toBeNull()
    expect(routeLink(HOME, '  ', choice())).toBeNull()
  })

  it('uses the link of the user, which needs a place for the start to give a route', () => {
    const route = 'https://maps.example.org/route?a={from}&b={to}'
    expect(routeLink('Home 1', 'Work 2', choice({ provider: 'custom', customTemplate: route }))).toBe(
      'https://maps.example.org/route?a=Home%201&b=Work%202'
    )
    const placeOnly = 'https://maps.example.org/?q={query}'
    expect(canRoute(choice({ provider: 'custom', customTemplate: placeOnly }))).toBe(false)
    expect(routeLink('Home', 'Work', choice({ provider: 'custom', customTemplate: placeOnly }))).toBeNull()
  })
})

describe('isValidTemplate', () => {
  it('wants a secure address with a place for the destination', () => {
    expect(isValidTemplate('https://example.org/?q={query}')).toBe(true)
    expect(isValidTemplate('https://example.org/?from={from}&to={to}')).toBe(true)
    expect(isValidTemplate('HTTPS://example.org/?q={to}')).toBe(true)
    expect(isValidTemplate('http://example.org/?q={query}')).toBe(false)
    expect(isValidTemplate('https://example.org/?q=fixed')).toBe(false)
    expect(isValidTemplate('javascript:alert({query})')).toBe(false)
    expect(isValidTemplate('https://')).toBe(false)
    expect(isValidTemplate('')).toBe(false)
  })
})

describe('joinAddress', () => {
  it('puts the parts on one line and leaves out the missing ones', () => {
    expect(joinAddress({ street: '1 rue X', postalCode: '75001', city: 'Paris', country: 'FR' })).toBe(
      '1 rue X, 75001 Paris, FR'
    )
    expect(joinAddress({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes' })).toBe('Lyon, Auvergne-Rhône-Alpes')
    expect(joinAddress({ postalCode: '69001' })).toBe('69001')
    expect(joinAddress({})).toBe('')
    expect(joinAddress({ street: '  ', city: ' Nice ' })).toBe('Nice')
  })
})

describe('formatCommute', () => {
  it('writes the distance and the time as people say them', () => {
    expect(formatCommute(12_400, 35)).toBe('12.4 km - 35 min')
    expect(formatCommute(5_000, 90)).toBe('5 km - 1 h30')
    expect(formatCommute(800, 5)).toBe('0.8 km - 5 min')
    expect(formatCommute(null, 45)).toBe('45 min')
    expect(formatCommute(3_000, null)).toBe('3 km')
    expect(formatCommute(null, null)).toBe('')
    expect(formatCommute(100_000, 60)).toBe('100 km - 1 h00')
  })
})
