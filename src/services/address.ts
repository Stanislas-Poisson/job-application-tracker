import { countryName, isCountry, listCountries } from '../utils/contact'

// A postal address in fields. Nothing is guessed from a free text: the fields come from the data of a page that gives them
// split (schema.org PostalAddress), or from the user.
export interface AddressParts {
  line1: string
  line2: string
  line3: string
  postalCode: string
  city: string
  region: string
  // An ISO 3166-1 country, or '' when it is not known.
  country: string
  // Where it is on the map, in degrees, when known: from the page, or pasted from a map by the user. Never looked up.
  latitude: number | null
  longitude: number | null
}

export const emptyAddress = (): AddressParts => ({
  line1: '',
  line2: '',
  line3: '',
  postalCode: '',
  city: '',
  region: '',
  country: '',
  latitude: null,
  longitude: null,
})

const clean = (value: unknown, max = 200): string =>
  'string' === typeof value ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

export const isLatitude = (value: unknown): value is number =>
  'number' === typeof value && Number.isFinite(value) && -90 <= value && 90 >= value
export const isLongitude = (value: unknown): value is number =>
  'number' === typeof value && Number.isFinite(value) && -180 <= value && 180 >= value

// An address as it is kept: the text trimmed, a country that is a code (or nothing), and a coordinate only if there is a valid
// pair of them. Anything that is not allowed is dropped, not repaired.
export function normalizeAddress(input: unknown): AddressParts {
  const source = ('object' === typeof input && null !== input ? input : {}) as Record<string, unknown>
  // A country is a code of two letters, exactly: a name cut short could be another country (Germany is not GE).
  const country = clean(source.country, 10).toUpperCase()
  const pair = isLatitude(source.latitude) && isLongitude(source.longitude)
  return {
    line1: clean(source.line1),
    line2: clean(source.line2),
    line3: clean(source.line3),
    postalCode: clean(source.postalCode, 20),
    city: clean(source.city),
    region: clean(source.region),
    country: isCountry(country) ? country : '',
    latitude: pair ? (source.latitude as number) : null,
    longitude: pair ? (source.longitude as number) : null,
  }
}

export const hasCoordinates = (address: Pick<AddressParts, 'latitude' | 'longitude'>): boolean =>
  isLatitude(address.latitude) && isLongitude(address.longitude)

// Whether there is anything to look up: a line, or a city, or a pair of coordinates.
export const hasAddress = (address: AddressParts): boolean =>
  '' !== address.line1 || '' !== address.city || '' !== address.postalCode || hasCoordinates(address)

// Where the postal code goes. In France, Germany, Spain… it comes before the city; in the United Kingdom and Ireland after it, and
// in the United States, Canada and Australia the region comes between ("Austin, TX 78701").
const AFTER_CITY = new Set(['GB', 'IE'])
const REGION_BETWEEN = new Set(['US', 'CA', 'AU'])

/**
 * The address on one line, in the order of its country: "5 avenue de l'Opéra, 69001 Lyon, France". What is missing is left out,
 * and the postal code and the city are not repeated when the lines already hold them (a page may give the whole address as its
 * street). The country is written in the language given.
 */
export function formatAddress(address: AddressParts, locale = 'en'): string {
  const lines = [address.line1, address.line2, address.line3].filter(Boolean)
  const written = lines.join(' ').toLowerCase()
  const repeated =
    ('' !== address.postalCode && written.includes(address.postalCode.toLowerCase())) ||
    ('' !== address.city && written.includes(address.city.toLowerCase()))

  let locality = ''
  if (!repeated) {
    if (REGION_BETWEEN.has(address.country)) {
      locality = [address.city, [address.region, address.postalCode].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    } else if (AFTER_CITY.has(address.country)) {
      locality = [address.city, address.postalCode].filter(Boolean).join(', ')
    } else {
      locality = [[address.postalCode, address.city].filter(Boolean).join(' '), address.region]
        .filter(Boolean)
        .join(', ')
    }
  }
  const country = '' === address.country ? '' : countryName(address.country, locale)
  const named = '' !== country && written.includes(country.toLowerCase()) ? '' : country
  return [...lines, locality, named].filter(Boolean).join(', ')
}

/**
 * Two coordinates written the way a map gives them: "47.3941, 0.6848", "47,3941; 0,6848", "47.3941 0.6848". Null when there
 * are not exactly two numbers, or one is out of range (a latitude is within 90 degrees, a longitude within 180).
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const numbers = text.match(/-?\d+(?:[.,]\d+)?/g)
  if (2 !== numbers?.length) {
    return null
  }
  const [latitude, longitude] = numbers.map((number) => Number(number.replace(',', '.')))
  return isLatitude(latitude) && isLongitude(longitude) ? { latitude, longitude } : null
}

export const formatCoordinates = (address: Pick<AddressParts, 'latitude' | 'longitude'>): string =>
  hasCoordinates(address) ? `${String(address.latitude)}, ${String(address.longitude)}` : ''

// A country given by its name (in English or in French, as the pages write it) as its code, or '' when it is not one.
export function countryFromName(name: string): string {
  const wanted = name.trim().toLowerCase()
  if ('' === wanted) {
    return ''
  }
  if (isCountry(wanted.toUpperCase())) {
    return wanted.toUpperCase()
  }
  return (
    listCountries().find((code) => ['en', 'fr'].some((locale) => countryName(code, locale).toLowerCase() === wanted)) ??
    ''
  )
}

// An address from a schema.org PostalAddress (and its geo), when the page gives it split. A street is the first line as it is.
export function addressFromSchema(address: unknown, geo: unknown): AddressParts {
  const source = ('object' === typeof address && null !== address ? address : {}) as Record<string, unknown>
  const place = ('object' === typeof geo && null !== geo ? geo : {}) as Record<string, unknown>
  const country = source.addressCountry
  const named = 'object' === typeof country && null !== country ? (country as { name?: unknown }).name : country
  return normalizeAddress({
    line1: source.streetAddress,
    line2: '',
    line3: '',
    postalCode: source.postalCode,
    city: source.addressLocality,
    region: source.addressRegion,
    country: countryFromName(clean(named)),
    latitude: Number(place.latitude ?? Number.NaN),
    longitude: Number(place.longitude ?? Number.NaN),
  })
}
