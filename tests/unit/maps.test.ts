import { describe, expect, it } from 'vitest'
import { emptyAddress } from '../../src/services/address'
import {
  type MapChoice,
  type Place,
  isValidTemplate,
  placeFrom,
  placeLink,
  routeIssue,
  routeLink,
} from '../../src/services/maps'

const choice = (changes: Partial<MapChoice> = {}): MapChoice => ({
  provider: 'google',
  customTemplate: '',
  mode: 'car',
  ...changes,
})
const at = (text: string, latitude: number | null = null, longitude: number | null = null): Place => ({
  text,
  latitude,
  longitude,
})
const HOME = at('12 rue de la Paix, 75002 Paris')
const WORK = at("5 avenue de l'Opéra & Cie, 69001 Lyon #2")
const HOME_GPS = at('12 rue de la Paix, 75002 Paris', 48.8686, 2.3316)
const WORK_GPS = at('Lyon', 45.7578, 4.832)

describe('placeFrom', () => {
  it('writes the address on one line in the order of its country, with the position when there is one', () => {
    const address = {
      ...emptyAddress(),
      line1: '5 rue X',
      postalCode: '69001',
      city: 'Lyon',
      country: 'FR',
      latitude: 45.76,
      longitude: 4.83,
    }
    expect(placeFrom(address, 'en')).toEqual({ text: '5 rue X, 69001 Lyon, France', latitude: 45.76, longitude: 4.83 })
    expect(placeFrom(address, 'fr').text).toBe('5 rue X, 69001 Lyon, France')
  })

  it('falls back on the place the offer names when there is no postal address', () => {
    expect(placeFrom(emptyAddress(), 'en', '  Lyon, France ')).toEqual({
      text: 'Lyon, France',
      latitude: null,
      longitude: null,
    })
    expect(placeFrom(emptyAddress(), 'en').text).toBe('')
  })
})

describe('placeLink', () => {
  it('builds the link of each service, with the address encoded', () => {
    const query = encodeURIComponent(WORK.text)
    expect(placeLink(WORK, choice())).toBe(`https://www.google.com/maps/search/?api=1&query=${query}`)
    expect(placeLink(WORK, choice({ provider: 'apple' }))).toBe(`https://maps.apple.com/?q=${query}`)
    expect(placeLink(WORK, choice({ provider: 'osm' }))).toBe(`https://www.openstreetmap.org/search?query=${query}`)
  })

  it('keeps an address from changing the link: the & and the # are encoded', () => {
    const link = new URL(placeLink(at('A & B # C'), choice()) as string)
    expect(link.searchParams.get('query')).toBe('A & B # C')
    expect(link.hash).toBe('')
    expect(link.hostname).toBe('www.google.com')
  })

  it('shows the position on OpenStreetMap when it is known, and asks for the coordinates when there is no address', () => {
    expect(placeLink(WORK_GPS, choice({ provider: 'osm' }))).toBe(
      'https://www.openstreetmap.org/?mlat=45.7578&mlon=4.832#map=17/45.7578/4.832'
    )
    expect(placeLink(at('', 45.76, 4.83), choice())).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.76%2C4.83'
    )
    expect(placeLink(at('', 45.76, 4.83), choice({ provider: 'apple' }))).toBe('https://maps.apple.com/?q=45.76%2C4.83')
  })

  it('gives nothing when there is neither an address nor a position', () => {
    expect(placeLink(at(''), choice())).toBeNull()
    expect(placeLink(at('   '), choice({ provider: 'osm' }))).toBeNull()
    expect(placeLink(at('', 45, null), choice())).toBeNull()
  })

  it('uses the link of the user when it is usable, and nothing when it is not', () => {
    const template = 'https://maps.example.org/?q={query}&at={lat},{lon}'
    expect(placeLink(at('Paris 1', 48.85, 2.35), choice({ provider: 'custom', customTemplate: template }))).toBe(
      'https://maps.example.org/?q=Paris%201&at=48.85,2.35'
    )
    expect(
      placeLink(at('Paris'), choice({ provider: 'custom', customTemplate: 'http://insecure/?q={query}' }))
    ).toBeNull()
    expect(placeLink(at('Paris'), choice({ provider: 'custom', customTemplate: '' }))).toBeNull()
  })
})

describe('routeLink', () => {
  it('builds the route of Google and Apple, in the way of travelling chosen', () => {
    const from = encodeURIComponent(HOME.text)
    const to = encodeURIComponent(WORK.text)
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

  it('uses the coordinates when there is no address, on either end', () => {
    expect(routeLink(at('', 48.8, 2.3), at('', 45.7, 4.8), choice())).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=48.8%2C2.3&destination=45.7%2C4.8&travelmode=driving'
    )
  })

  it('makes a route on OpenStreetMap from the coordinates of both ends, which text could not', () => {
    expect(routeLink(HOME_GPS, WORK_GPS, choice({ provider: 'osm' }))).toBe(
      'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=48.8686%2C2.3316%3B45.7578%2C4.832'
    )
    expect(routeLink(HOME_GPS, WORK_GPS, choice({ provider: 'osm', mode: 'bike' }))).toContain(
      'engine=fossgis_osrm_bike'
    )
    expect(routeLink(HOME_GPS, WORK_GPS, choice({ provider: 'osm', mode: 'walk' }))).toContain(
      'engine=fossgis_osrm_foot'
    )
  })

  it('says why OpenStreetMap makes no route: a position is missing, or the way is public transport', () => {
    expect(routeLink(HOME, WORK_GPS, choice({ provider: 'osm' }))).toBeNull()
    expect(routeIssue(HOME, WORK_GPS, choice({ provider: 'osm' }))).toBe('needs-coordinates')
    expect(routeIssue(HOME_GPS, WORK, choice({ provider: 'osm' }))).toBe('needs-coordinates')
    expect(routeLink(HOME_GPS, WORK_GPS, choice({ provider: 'osm', mode: 'transit' }))).toBeNull()
    expect(routeIssue(HOME_GPS, WORK_GPS, choice({ provider: 'osm', mode: 'transit' }))).toBe('no-transit')
  })

  it('needs both ends, and says which one is missing', () => {
    expect(routeIssue(at(''), WORK, choice())).toBe('origin')
    expect(routeIssue(HOME, at('  '), choice())).toBe('destination')
    expect(routeLink(at(''), WORK, choice())).toBeNull()
    expect(routeLink(HOME, at(''), choice())).toBeNull()
    expect(routeIssue(HOME, WORK, choice())).toBeNull()
  })

  it('uses the link of the user, which needs a place for the start to give a route', () => {
    const route = 'https://maps.example.org/route?a={from}&b={to}&c={fromLat},{fromLon}&d={toLat},{toLon}'
    expect(
      routeLink(at('Home 1', 1.5, 2.5), at('Work 2', 3.5, 4.5), choice({ provider: 'custom', customTemplate: route }))
    ).toBe('https://maps.example.org/route?a=Home%201&b=Work%202&c=1.5,2.5&d=3.5,4.5')
    const placeOnly = 'https://maps.example.org/?q={query}'
    expect(routeIssue(HOME, WORK, choice({ provider: 'custom', customTemplate: placeOnly }))).toBe('template')
    expect(routeLink(HOME, WORK, choice({ provider: 'custom', customTemplate: placeOnly }))).toBeNull()
    expect(routeIssue(HOME, WORK, choice({ provider: 'custom', customTemplate: 'http://x/{from}{to}' }))).toBe(
      'template'
    )
  })
})

describe('isValidTemplate', () => {
  it('wants a secure address with a place for the destination', () => {
    expect(isValidTemplate('https://example.org/?q={query}')).toBe(true)
    expect(isValidTemplate('https://example.org/?from={from}&to={to}')).toBe(true)
    expect(isValidTemplate('https://example.org/?at={lat},{lon}')).toBe(true)
    expect(isValidTemplate('HTTPS://example.org/?q={to}')).toBe(true)
    expect(isValidTemplate('http://example.org/?q={query}')).toBe(false)
    expect(isValidTemplate('https://example.org/?q=fixed')).toBe(false)
    expect(isValidTemplate('javascript:alert({query})')).toBe(false)
    expect(isValidTemplate('https://')).toBe(false)
    expect(isValidTemplate('')).toBe(false)
  })
})
