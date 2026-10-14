import { type Salary, type SalaryKind, type SalaryPeriod, toMinor } from '../utils/money'

const CURRENCIES: Record<string, string> = {
  '€': 'EUR',
  EUR: 'EUR',
  $: 'USD',
  USD: 'USD',
  '£': 'GBP',
  GBP: 'GBP',
  CHF: 'CHF',
}

const PERIODS: Record<string, SalaryPeriod> = {
  yr: 'year',
  year: 'year',
  an: 'year',
  ans: 'year',
  annum: 'year',
  mo: 'month',
  month: 'month',
  mois: 'month',
  wk: 'week',
  week: 'week',
  semaine: 'week',
  day: 'day',
  jour: 'day',
  hr: 'hour',
  hour: 'hour',
  h: 'hour',
  heure: 'hour',
}

// A number as people write it: groups of three digits ("45 000", "90,000") or a decimal part ("3,5").
const NUMBER = String.raw`\d+(?:[\s.,]\d{3})*(?:[.,]\d+)?`
const CURRENCY = String.raw`€|\$|£|CHF|EUR|USD|GBP`
// The currency comes before the amount ("$90,000", "€55K") or after it ("40K €", "45 000 €").
const AMOUNT = new RegExp(
  String.raw`(${CURRENCY})\s*(${NUMBER})\s*([KkMm])?|(${NUMBER})\s*([KkMm])?\s*(${CURRENCY})`,
  'g'
)
const PERIOD = /(?:par|per|\/)\s*(yr|year|annum|ans?|mo|month|mois|wk|week|semaine|day|jour|hr|hour|h|heure)\b/i

// "40K", "40 000", "40,000", "1,5K" into a number.
function toNumber(raw: string, suffix: string | undefined): number | null {
  const digits = raw.replace(/\s/g, '')
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(digits)
  const value = Number(grouped ? digits.replace(/[.,]/g, '') : digits.replace(',', '.'))
  if (Number.isNaN(value)) {
    return null
  }
  const letter = suffix?.toLowerCase()
  return value * ('k' === letter ? 1000 : 'm' === letter ? 1_000_000 : 1)
}

// The words that say a period or gross/net, in French and English. "par an" and "/yr" are read apart (PERIOD above).
const PERIOD_WORDS: [RegExp, SalaryPeriod][] = [
  [/\b(?:annuels?|annuelles?|annual|annually|yearly)\b/i, 'year'],
  [/\b(?:mensuels?|mensuelles?|monthly)\b/i, 'month'],
  [/\b(?:hebdomadaires?|weekly)\b/i, 'week'],
  [/\b(?:journalier|journali[eè]re|quotidien|daily)\b/i, 'day'],
  [/\b(?:horaires?|hourly)\b/i, 'hour'],
]

// Gross or net, when the text says it: "40 k€ brut annuel", "35K net". Gross wins when both words are there ("brut / net").
export function kindFromWords(text: string): SalaryKind | null {
  if (/\b(?:brut|bruts|gross)\b/i.test(text)) {
    return 'gross'
  }
  return /\b(?:net|nets)\b/i.test(text) ? 'net' : null
}

export function periodFromWords(text: string): SalaryPeriod | null {
  return PERIOD_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null
}

// Where a salary-like amount is written in a text: its place, its length and its value in minor units.
export function findAmounts(text: string): { index: number; length: number; minor: number; currency: string }[] {
  return [...text.matchAll(AMOUNT)].flatMap((match) => {
    const symbol = match[1] ?? match[6]
    const currency = symbol ? CURRENCIES[symbol] : undefined
    const raw = match[2] ?? match[4]
    const amount = raw ? toNumber(raw, match[3] ?? match[5]) : null
    return currency && null !== amount
      ? [{ index: match.index ?? 0, length: match[0].length, minor: toMinor(String(amount), currency), currency }]
      : []
  })
}

/**
 * A salary written in a line of text: "40K € par yr - 60K € par yr", "45 000 € - 55 000 €/an", "$90,000/yr".
 * One amount is both ends; two amounts are the range. Gross or net is not guessed. Null when no amount is found.
 */
export function salaryFromText(text: string): Salary | null {
  const found = [...text.matchAll(AMOUNT)].map((match) => ({
    symbol: match[1] ?? match[6],
    raw: match[2] ?? match[4],
    suffix: match[3] ?? match[5],
  }))
  const currency = found[0]?.symbol ? CURRENCIES[found[0].symbol] : undefined
  if (undefined === currency) {
    return null
  }
  const minor = (raw: string | undefined, suffix: string | undefined): number | null => {
    const amount = raw ? toNumber(raw, suffix) : null
    return null === amount ? null : toMinor(String(amount), currency)
  }
  const min = minor(found[0]?.raw, found[0]?.suffix)
  const max = found[1] ? minor(found[1].raw, found[1].suffix) : min
  if (null === min || null === max) {
    return null
  }
  const period = PERIOD.exec(text)?.[1]
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    currency,
    period: period ? (PERIODS[period.toLowerCase()] ?? null) : periodFromWords(text),
    kind: kindFromWords(text),
  }
}
