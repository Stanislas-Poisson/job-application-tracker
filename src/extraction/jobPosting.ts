import { joinAddress } from '../services/maps'
import { type Salary, type SalaryPeriod, currencyDigits, isCurrency, toMinor } from '../utils/money'
import { postedDay } from '../utils/time'

// What a page told us about an offer, in the form the capture service takes. A missing piece is left out.
export interface ReadOffer {
  title?: string
  companyName?: string
  location?: string
  // The postal address of the workplace on one line, when the page gives a street.
  address?: string
  country?: string
  contractType?: string
  workMode?: 'onsite' | 'hybrid' | 'remote'
  description?: string
  postedOn?: string
  salary?: Salary
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => 'object' === typeof value && null !== value && !Array.isArray(value)

const asList = <T>(value: T | T[] | undefined | null): T[] =>
  undefined === value || null === value ? [] : ([value].flat() as T[])

const typesOf = (node: Json): string[] => asList(node['@type'] as string | string[]).map((type) => String(type))

// The JobPosting nodes of a JSON-LD document: at the root, in a list, or in an @graph.
function jobPostings(document: unknown): Json[] {
  const found: Json[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
    } else if (isObject(node)) {
      if (typesOf(node).some((type) => type.endsWith('JobPosting'))) {
        found.push(node)
      }
      visit(node['@graph'])
    }
  }
  visit(document)
  return found
}

// The texts of the page's JSON-LD scripts into JobPosting nodes. A script that is not valid JSON is skipped.
export function findJobPostings(scripts: string[]): Json[] {
  return scripts.flatMap((script) => {
    try {
      return jobPostings(JSON.parse(script))
    } catch {
      return []
    }
  })
}

const text = (value: unknown): string | undefined => {
  if ('string' === typeof value || 'number' === typeof value) {
    const clean = String(value).replace(/\s+/g, ' ').trim()
    return '' === clean ? undefined : clean
  }
  return undefined
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  hellip: '…',
  ndash: '–',
  mdash: '—',
}

// "&amp;", "&#233;" and "&#xE9;" into the character. What is not known is left as it was written.
function decodeEntity(whole: string, name: string): string {
  const code = /^#x([\da-f]+)$/i.exec(name)?.[1] ?? /^#(\d+)$/.exec(name)?.[1]
  if (undefined !== code) {
    const point = Number.parseInt(code, name.startsWith('#x') || name.startsWith('#X') ? 16 : 10)
    return 0 < point && 0x10ffff >= point ? String.fromCodePoint(point) : whole
  }
  return ENTITIES[name] ?? whole
}

// The description is HTML in most pages: keep the text, with a line break where a block ends.
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, decodeEntity)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function organizationName(posting: Json): string | undefined {
  const [first] = asList(posting.hiringOrganization as Json | string)
  return isObject(first) ? (text(first.name) ?? text(first.legalName)) : text(first)
}

function countryCode(value: unknown): string | undefined {
  const raw = isObject(value) ? text(value.name) : text(value)
  return raw && /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : undefined
}

// "Paris, Île-de-France, FR" from the address of the first place of the offer.
function place(posting: Json): { location?: string; country?: string; address?: string } {
  const [first] = asList(posting.jobLocation as Json | Json[])
  const address = isObject(first) ? first.address : undefined
  if (!isObject(address)) {
    return { location: text(address) }
  }
  const country = countryCode(address.addressCountry)
  // A country given as a code (FR) is kept apart: the board shows its name. A country given as a name stays in the text.
  const named =
    undefined === country
      ? [isObject(address.addressCountry) ? address.addressCountry.name : address.addressCountry]
      : []
  const parts = [address.addressLocality, address.addressRegion, ...named]
    .map(text)
    .filter((part): part is string => undefined !== part)
    // Some sites repeat the city as the region.
    .filter((part, index, all) => part !== all[index - 1])
  return { location: 0 < parts.length ? parts.join(', ') : undefined, country, address: addressOf(address, country) }
}

// The street address on one line. Some sites put the whole address in the street ("18 Place des Reflets, 92400 Courbevoie"):
// then it is taken as it is, and the postal code and the city are not added a second time.
function addressOf(address: Json, country: string | undefined): string | undefined {
  const street = text(address.streetAddress)
  if (undefined === street) {
    return undefined
  }
  const postalCode = text(address.postalCode)
  const city = text(address.addressLocality)
  const complete = [postalCode, city]
    .filter((part): part is string => undefined !== part)
    .some((part) => street.includes(part))
  const named = isObject(address.addressCountry) ? text(address.addressCountry.name) : text(address.addressCountry)
  return joinAddress(complete ? { street } : { street, postalCode, city, country: named ?? country })
}

const PERIODS: Record<string, SalaryPeriod> = {
  YEAR: 'year',
  YEARLY: 'year',
  ANNUAL: 'year',
  MONTH: 'month',
  MONTHLY: 'month',
  WEEK: 'week',
  WEEKLY: 'week',
  DAY: 'day',
  DAILY: 'day',
  HOUR: 'hour',
  HOURLY: 'hour',
}

function salaryOf(posting: Json): Salary | undefined {
  const [base] = asList(posting.baseSalary as Json | Json[])
  if (!isObject(base)) {
    return undefined
  }
  const currency = text(base.currency)?.toUpperCase()
  if (!currency || !isCurrency(currency)) {
    return undefined
  }
  const value = base.value
  const amounts = isObject(value) ? value : { value }
  const amount = (raw: unknown): number | null => {
    const asText = text(raw)
    if (undefined === asText) {
      return null
    }
    try {
      const minor = toMinor(asText, currency)
      return 0 <= minor ? minor : null
    } catch {
      return null
    }
  }

  const exact = amount(amounts.value)
  const min = amount(amounts.minValue) ?? exact
  const max = amount(amounts.maxValue) ?? exact
  if (null === min && null === max) {
    return undefined
  }
  const unit = (text(amounts.unitText) ?? text(base.unitText))?.toUpperCase()
  const period = unit ? (PERIODS[unit] ?? null) : null
  // A yearly salary under 1 000 is a salary in thousands that the site did not say so (30 for 30 000): it is not
  // guessed, it is left out.
  if ('year' === period && 1000 > (max ?? min ?? 0) / 10 ** currencyDigits(currency)) {
    return undefined
  }
  // Some sites also write the salary as a text ("80 - 85 k€ brut annuel"), which is where gross or net is said.
  const written = 'string' === typeof amounts.value ? amounts.value : ''
  const kind = /\b(brut|gross)\b/i.test(written) ? 'gross' : /\bnet\b/i.test(written) ? 'net' : null
  return { min, max, currency, period, kind }
}

// The values schema.org knows for employmentType, readable. A value of the site (CDI, Stage) is kept as it is.
const CONTRACTS: Record<string, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACTOR: 'Contractor',
  TEMPORARY: 'Temporary',
  INTERN: 'Internship',
  VOLUNTEER: 'Volunteer',
  PER_DIEM: 'Per diem',
  OTHER: 'Other',
}

const contractLabel = (value: unknown): string | undefined => {
  const raw = text(value)
  return raw ? (CONTRACTS[raw.toUpperCase()] ?? raw) : undefined
}

function workModeOf(posting: Json): ReadOffer['workMode'] {
  return asList(posting.jobLocationType as string | string[]).some(
    (type) => 'TELECOMMUTE' === String(type).toUpperCase()
  )
    ? 'remote'
    : undefined
}

// The offer a JobPosting describes. `zone` is the time zone of the user: the one a date is read in when the page does
// not say which it uses.
export function offerFromJobPosting(posting: Json, zone: string): ReadOffer {
  const offer: ReadOffer = {
    title: text(posting.title) ?? text(posting.name),
    companyName: organizationName(posting),
    ...place(posting),
    contractType:
      asList(posting.employmentType as string | string[])
        .map(contractLabel)
        .filter(Boolean)
        .join(', ') || undefined,
    workMode: workModeOf(posting),
    description: 'string' === typeof posting.description ? htmlToText(posting.description) || undefined : undefined,
    postedOn: postedDay(posting.datePosted, zone) ?? undefined,
    salary: salaryOf(posting),
  }
  return Object.fromEntries(Object.entries(offer).filter(([, value]) => undefined !== value)) as ReadOffer
}
