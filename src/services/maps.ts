import { type AddressParts, formatAddress, hasCoordinates } from './address'

// Links to a map service. The extension asks nothing of any service: it builds a link, and the browser opens it when the
// user clicks. The address goes to the service then, and only then. The user searches there and keeps in the offer what
// they found (see the distance and the time of an offer).

export const PROVIDERS = ['google', 'osm', 'apple', 'custom'] as const
export const TRAVEL_MODES = ['car', 'transit', 'bike', 'walk'] as const

export type Provider = (typeof PROVIDERS)[number]
export type TravelMode = (typeof TRAVEL_MODES)[number]

export interface MapChoice {
  provider: Provider
  // For a service of the user's own: a link with {from} and {to} for a route, {query} (or {to}) for a place.
  customTemplate: string
  mode: TravelMode
}

// Somewhere to go to or to leave from: an address written on one line, and its coordinates when they are known. Either is enough
// for a link; the services that need coordinates (a route on OpenStreetMap) use them.
export interface Place {
  text: string
  latitude: number | null
  longitude: number | null
}

export const placeFrom = (address: AddressParts, locale: string, fallbackText = ''): Place => ({
  text: formatAddress(address, locale) || fallbackText.trim(),
  latitude: hasCoordinates(address) ? address.latitude : null,
  longitude: hasCoordinates(address) ? address.longitude : null,
})

const hasPosition = (place: Place): boolean => null !== place.latitude && null !== place.longitude
const isKnown = (place: Place): boolean => '' !== place.text.trim() || hasPosition(place)
const position = (place: Place): string => `${String(place.latitude)},${String(place.longitude)}`
// What a service is asked for: the address when there is one (a name a person can read), else the coordinates.
const asked = (place: Place): string => ('' !== place.text.trim() ? place.text.trim() : position(place))

const encode = (value: string): string => encodeURIComponent(value.trim())

const GOOGLE_MODE: Record<TravelMode, string> = {
  car: 'driving',
  transit: 'transit',
  bike: 'bicycling',
  walk: 'walking',
}
const APPLE_MODE: Record<TravelMode, string> = { car: 'd', transit: 'r', bike: 'b', walk: 'w' }
// The route of OpenStreetMap is made by an engine for each way of travelling. There is none for public transport.
const OSM_ENGINE: Partial<Record<TravelMode, string>> = {
  car: 'fossgis_osrm_car',
  bike: 'fossgis_osrm_bike',
  walk: 'fossgis_osrm_foot',
}

const PLACEHOLDER = /\{(from|to|query|lat|lon|fromLat|fromLon|toLat|toLon)\}/g

// Whether a link of the user's own can be used: a secure address that has a place for the destination.
export function isValidTemplate(template: string): boolean {
  if (!/^https:\/\//i.test(template.trim()) || !/\{(to|query|lat)\}/.test(template)) {
    return false
  }
  try {
    new URL(template.trim().replace(PLACEHOLDER, 'x'))
    return true
  } catch {
    return false
  }
}

const fill = (template: string, values: Record<string, string>): string =>
  template.trim().replace(PLACEHOLDER, (_whole, name: string) => encode(values[name] ?? ''))

const numberText = (value: number | null): string => (null === value ? '' : String(value))

/** The link that shows a place on the map, or null when there is nothing to show (or the link of the user is not usable). */
export function placeLink(place: Place, choice: MapChoice): string | null {
  if (!isKnown(place)) {
    return null
  }
  switch (choice.provider) {
    case 'google':
      return `https://www.google.com/maps/search/?api=1&query=${encode(asked(place))}`
    case 'apple':
      return `https://maps.apple.com/?q=${encode(asked(place))}`
    case 'osm':
      return hasPosition(place)
        ? `https://www.openstreetmap.org/?mlat=${String(place.latitude)}&mlon=${String(place.longitude)}#map=17/${String(place.latitude)}/${String(place.longitude)}`
        : `https://www.openstreetmap.org/search?query=${encode(place.text)}`
    case 'custom':
      return isValidTemplate(choice.customTemplate)
        ? fill(choice.customTemplate, {
            query: asked(place),
            to: asked(place),
            from: '',
            lat: numberText(place.latitude),
            lon: numberText(place.longitude),
          })
        : null
  }
}

// Why there is no route link, as the key of the message to show; null when there is one.
export type RouteIssue = 'origin' | 'destination' | 'needs-coordinates' | 'no-transit' | 'template'

export function routeIssue(from: Place, to: Place, choice: MapChoice): RouteIssue | null {
  if (!isKnown(from)) {
    return 'origin'
  }
  if (!isKnown(to)) {
    return 'destination'
  }
  if ('osm' === choice.provider) {
    if (undefined === OSM_ENGINE[choice.mode]) {
      return 'no-transit'
    }
    return hasPosition(from) && hasPosition(to) ? null : 'needs-coordinates'
  }
  if (
    'custom' === choice.provider &&
    (!isValidTemplate(choice.customTemplate) || !/\{(from|fromLat)\}/.test(choice.customTemplate))
  ) {
    return 'template'
  }
  return null
}

/** The link that shows the route from one place to another, in the way of travelling chosen. Null when it cannot be made. */
export function routeLink(from: Place, to: Place, choice: MapChoice): string | null {
  if (null !== routeIssue(from, to, choice)) {
    return null
  }
  switch (choice.provider) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&origin=${encode(asked(from))}&destination=${encode(asked(to))}&travelmode=${GOOGLE_MODE[choice.mode]}`
    case 'apple':
      return `https://maps.apple.com/?saddr=${encode(asked(from))}&daddr=${encode(asked(to))}&dirflg=${APPLE_MODE[choice.mode]}`
    case 'osm':
      return `https://www.openstreetmap.org/directions?engine=${OSM_ENGINE[choice.mode] ?? ''}&route=${encodeURIComponent(position(from))}${encodeURIComponent(';')}${encodeURIComponent(position(to))}`
    case 'custom':
      return fill(choice.customTemplate, {
        from: asked(from),
        to: asked(to),
        query: asked(to),
        fromLat: numberText(from.latitude),
        fromLon: numberText(from.longitude),
        toLat: numberText(to.latitude),
        toLon: numberText(to.longitude),
        lat: numberText(to.latitude),
        lon: numberText(to.longitude),
      })
  }
}

// The way there as people say it: "12.4 km - 35 min by car".
export function formatCommute(meters: number | null, minutes: number | null): string {
  const parts: string[] = []
  if (null !== meters) {
    parts.push(`${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`)
  }
  if (null !== minutes) {
    parts.push(
      60 > minutes ? `${minutes} min` : `${Math.floor(minutes / 60)} h${String(minutes % 60).padStart(2, '0')}`
    )
  }
  return parts.join(' - ')
}
