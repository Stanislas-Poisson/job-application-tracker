import { type CountryCode, getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/min'

// What the extension keeps about a person is stored in one form that means the same everywhere, and shown in the way of
// the user:
//
// - a phone number in E.164 (+33612345678), shown in the international or the national format;
// - an email in lower case;
// - a LinkedIn page as its canonical address (https://www.linkedin.com/in/name);
// - a country as its ISO 3166-1 alpha-2 code (FR), shown by its name in the language of the user;
// - a time zone as a name of the IANA database (Europe/Paris);
// - a language as a BCP 47 tag (fr-CA).

const COUNTRIES = new Set<string>(getCountries())

export const listCountries = (): string[] => [...COUNTRIES].sort()

export const isCountry = (code: unknown): code is CountryCode => 'string' === typeof code && COUNTRIES.has(code)

// "FR" or "fr" or " fr " into "FR", and null for what is not a country.
export function normalizeCountry(input: string): CountryCode | null {
  const code = input.trim().toUpperCase()
  return isCountry(code) ? code : null
}

export function countryName(code: string, locale: string): string {
  return new Intl.DisplayNames(locale, { type: 'region' }).of(code) ?? code
}

// The country of a language tag: "fr-CA" is Canada, "en" is the United States, "fr" is France. Null when it is not known.
export function regionOf(tag: string): CountryCode | null {
  try {
    const region = new Intl.Locale(tag).maximize().region
    return region && isCountry(region) ? region : null
  } catch {
    return null
  }
}

// "auto" is the country of the language of the browser.
export function resolveCountry(setting: string, browserLanguage: string): CountryCode | undefined {
  if ('auto' !== setting) {
    return isCountry(setting) ? setting : undefined
  }
  return regionOf(browserLanguage) ?? undefined
}

export interface Phone {
  // +33612345678
  e164: string
  // +33 6 12 34 56 78
  international: string
  // 06 12 34 56 78, in the country of the number
  national: string
  country: string | null
}

// A phone number as typed, with or without the country code. A number without one is read in the default country.
export function normalizePhone(input: string, defaultCountry?: CountryCode): Phone | null {
  const text = input.trim()
  if ('' === text) {
    return null
  }
  const number = parsePhoneNumberFromString(text, defaultCountry)
  if (!number?.isValid()) {
    return null
  }
  return {
    e164: number.number,
    international: number.formatInternational(),
    national: number.formatNational(),
    country: number.country ?? null,
  }
}

// A stored number, written the way the user wants. A text that is not a number is shown as it is.
export function formatPhone(e164: string, style: 'international' | 'national' | 'e164' = 'international'): string {
  if ('e164' === style) {
    return e164
  }
  const number = parsePhoneNumberFromString(e164)
  if (!number) {
    return e164
  }
  return 'national' === style ? number.formatNational() : number.formatInternational()
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase()
  return EMAIL.test(email) ? email : null
}

// A LinkedIn page, as typed or pasted: with or without the protocol, the "www", a country or mobile sub-domain, a
// slash or a query at the end. A bare name is taken as the name of a person's page.
export function normalizeLinkedIn(input: string): string | null {
  const text = input.trim().replace(/^@/, '')
  if ('' === text) {
    return null
  }

  let path: string
  const hasHost = /linkedin\.com/i.test(text)
  if (hasHost) {
    const match = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?linkedin\.com\/(.+)$/i.exec(text)
    if (!match?.[1]) {
      return null
    }
    path = match[1]
  } else if (/^[\w%.-]+$/.test(text)) {
    path = `in/${text}`
  } else {
    return null
  }

  const [kind, slug] = (path.split(/[?#]/)[0] ?? '').split('/').filter(Boolean)
  if (!slug || !['in', 'company', 'school'].includes(kind ?? '')) {
    return null
  }
  let name: string
  try {
    name = decodeURIComponent(slug).toLowerCase()
  } catch {
    return null
  }
  return `https://www.linkedin.com/${kind}/${encodeURIComponent(name)}`
}

// A language tag in its canonical form: "FR-ca" is "fr-CA". Null for what is not a language tag.
export function normalizeLanguage(input: string): string | null {
  try {
    return Intl.getCanonicalLocales(input.trim())[0] ?? null
  } catch {
    return null
  }
}

export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}
