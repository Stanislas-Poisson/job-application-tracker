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

const encode = (value: string): string => encodeURIComponent(value.trim())

const GOOGLE_MODE: Record<TravelMode, string> = {
  car: 'driving',
  transit: 'transit',
  bike: 'bicycling',
  walk: 'walking',
}
const APPLE_MODE: Record<TravelMode, string> = { car: 'd', transit: 'r', bike: 'b', walk: 'w' }

// Whether a link of the user's own can be used: a secure address that has a place to put the destination in.
export function isValidTemplate(template: string): boolean {
  if (!/^https:\/\//i.test(template.trim()) || !/\{(to|query)\}/.test(template)) {
    return false
  }
  try {
    new URL(template.trim().replace(/\{(from|to|query)\}/g, 'x'))
    return true
  } catch {
    return false
  }
}

const fill = (template: string, values: Record<string, string>): string =>
  template.trim().replace(/\{(from|to|query)\}/g, (_whole, name: string) => encode(values[name] ?? ''))

// Whether the service gives a route from two addresses written as text. OpenStreetMap does not: its route link needs
// coordinates, which would take a request to a geocoding service. For it, only the place is shown.
export function canRoute(choice: MapChoice): boolean {
  return 'osm' !== choice.provider && ('custom' !== choice.provider || /\{from\}/.test(choice.customTemplate))
}

/** The link that shows a place on the map, or null when there is no address (or the link of the user is not usable). */
export function placeLink(address: string, choice: MapChoice): string | null {
  if ('' === address.trim()) {
    return null
  }
  switch (choice.provider) {
    case 'google':
      return `https://www.google.com/maps/search/?api=1&query=${encode(address)}`
    case 'apple':
      return `https://maps.apple.com/?q=${encode(address)}`
    case 'osm':
      return `https://www.openstreetmap.org/search?query=${encode(address)}`
    case 'custom':
      return isValidTemplate(choice.customTemplate)
        ? fill(choice.customTemplate, { query: address, to: address, from: '' })
        : null
  }
}

/** The link that shows the route from one address to another, in the way of travelling chosen. Null when it cannot be made. */
export function routeLink(from: string, to: string, choice: MapChoice): string | null {
  if ('' === from.trim() || '' === to.trim() || !canRoute(choice)) {
    return null
  }
  switch (choice.provider) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&origin=${encode(from)}&destination=${encode(to)}&travelmode=${GOOGLE_MODE[choice.mode]}`
    case 'apple':
      return `https://maps.apple.com/?saddr=${encode(from)}&daddr=${encode(to)}&dirflg=${APPLE_MODE[choice.mode]}`
    case 'custom':
      return isValidTemplate(choice.customTemplate) ? fill(choice.customTemplate, { from, to, query: to }) : null
    default:
      return null
  }
}

// An address on one line, from its parts, leaving out what is missing: "1 rue X, 75001 Paris, FR".
export function joinAddress(parts: {
  street?: string
  postalCode?: string
  city?: string
  region?: string
  country?: string
}): string {
  const town = [parts.postalCode, parts.city].filter(Boolean).join(' ')
  return [parts.street, town, parts.region, parts.country]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ')
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
