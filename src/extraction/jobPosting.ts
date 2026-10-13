import { type Salary, type SalaryPeriod, isCurrency, toMinor } from '../utils/money'
import { postedDay } from '../utils/time'

// What a page told us about an offer, in the form the capture service takes. A missing piece is left out.
export interface ReadOffer {
  title?: string
  companyName?: string
  location?: string
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

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

// The description is HTML in most pages: keep the text, with a line break where a block ends.
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
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
function place(posting: Json): { location?: string; country?: string } {
  const [first] = asList(posting.jobLocation as Json | Json[])
  const address = isObject(first) ? first.address : undefined
  if (!isObject(address)) {
    return { location: text(address) }
  }
  const parts = [
    address.addressLocality,
    address.addressRegion,
    isObject(address.addressCountry) ? address.addressCountry.name : address.addressCountry,
  ]
    .map(text)
    .filter((part): part is string => undefined !== part)
  const country = countryCode(address.addressCountry)
  return { location: 0 < parts.length ? parts.join(', ') : undefined, country }
}

const PERIODS: Record<string, SalaryPeriod> = {
  YEAR: 'year',
  ANNUAL: 'year',
  MONTH: 'month',
  WEEK: 'week',
  DAY: 'day',
  HOUR: 'hour',
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
  // Whether the amount is gross or net is almost never said: it is left for the user.
  return { min, max, currency, period: unit ? (PERIODS[unit] ?? null) : null, kind: null }
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
        .map(text)
        .filter(Boolean)
        .join(', ') || undefined,
    workMode: workModeOf(posting),
    description: 'string' === typeof posting.description ? htmlToText(posting.description) || undefined : undefined,
    postedOn: postedDay(posting.datePosted, zone) ?? undefined,
    salary: salaryOf(posting),
  }
  return Object.fromEntries(Object.entries(offer).filter(([, value]) => undefined !== value)) as ReadOffer
}
