// Money in the extension follows these rules:
//
// - An amount is stored in minor units, as an integer (cents for the euro, none for the yen), with the code of its
//   currency (ISO 4217). Nothing is stored as a decimal, so nothing is rounded by surprise.
// - A salary is a range with a period (per year, month, week, day or hour) and may be gross or net.
// - It is shown with the format of the currency and of the language: the symbol, the place of the symbol, the
//   separators and the digits all come from `Intl`.
// - To compare offers, a salary is turned into an amount per year, and into the home currency of the user with the
//   exchange rates that the user gives. The extension never fetches a rate.

export const SALARY_PERIODS = ['year', 'month', 'week', 'day', 'hour'] as const
export const SALARY_KINDS = ['gross', 'net'] as const
export const CURRENCY_DISPLAYS = ['symbol', 'narrowSymbol', 'code', 'name'] as const

export type SalaryPeriod = (typeof SALARY_PERIODS)[number]
export type SalaryKind = (typeof SALARY_KINDS)[number]
export type CurrencyDisplay = (typeof CURRENCY_DISPLAYS)[number]

export interface Salary {
  // In minor units. Either one can be missing: "from 45 000" or "up to 55 000".
  min: number | null
  max: number | null
  currency: string | null
  period: SalaryPeriod | null
  kind: SalaryKind | null
}

// What a year is worth, to turn a day or an hour into a year.
export interface Assumptions {
  workingDaysPerYear: number
  hoursPerDay: number
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { workingDaysPerYear: 220, hoursPerDay: 7 }

const FALLBACK_CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'INR',
  'BRL',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
]

export function listCurrencies(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const list = supported ? supported('currency') : []
  return 0 < list.length ? list : FALLBACK_CURRENCIES
}

export function isCurrency(code: unknown): code is string {
  if ('string' !== typeof code || !/^[A-Z]{3}$/.test(code)) {
    return false
  }
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code })
    return true
  } catch {
    return false
  }
}

// How many digits follow the decimal mark: 2 for the euro, 0 for the yen, 3 for the Kuwaiti dinar.
export function currencyDigits(code: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
}

// "45000.5" or 45000.5 into minor units. The exponent is written in the string, so that 1.005 does not become 1.00.
export function toMinor(amount: number | string, code: string): number {
  const text = String(amount).trim().replace(',', '.')
  if ('' === text || Number.isNaN(Number(text))) {
    throw new Error(`Not an amount: ${String(amount)}`)
  }
  return Math.round(Number(`${text}e${currencyDigits(code)}`))
}

export const fromMinor = (minor: number, code: string): number => minor / 10 ** currencyDigits(code)

// The amount as a plain decimal text, for a form field: "45000" or "45000.5", with a point.
export function minorToInput(minor: number | null, code: string | null): string {
  return null === minor || null === code ? '' : String(fromMinor(minor, code))
}

export function formatMoney(minor: number, code: string, locale: string, display: CurrencyDisplay = 'symbol'): string {
  const digits = currencyDigits(code)
  const whole = 0 === minor % 10 ** digits
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: display,
    // A salary of 45 000 is not written 45 000,00.
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(fromMinor(minor, code))
}

// The name of a currency in a language: "euro", "dollar des États-Unis".
export function currencyName(code: string, locale: string): string {
  return new Intl.DisplayNames(locale, { type: 'currency' }).of(code) ?? code
}

export interface SalaryLabels {
  from: (amount: string) => string
  upTo: (amount: string) => string
  per: Record<SalaryPeriod, string>
  kind: Record<SalaryKind, string>
}

// "€45,000 – €55,000 / year (gross)", "from $90,000 / year", "up to £400 / day".
export function describeSalary(salary: Salary, locale: string, display: CurrencyDisplay, labels: SalaryLabels): string {
  const { min, max, currency } = salary
  if (null === currency || (null === min && null === max)) {
    return ''
  }

  let amount: string
  if (null !== min && null !== max && min !== max) {
    const digits = currencyDigits(currency)
    const whole = 0 === min % 10 ** digits && 0 === max % 10 ** digits
    const ranged = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: display,
      minimumFractionDigits: whole ? 0 : digits,
      maximumFractionDigits: digits,
    })
    amount = ranged.formatRange(fromMinor(min, currency), fromMinor(max, currency))
  } else if (null !== min && null !== max) {
    amount = formatMoney(min, currency, locale, display)
  } else if (null !== min) {
    amount = labels.from(formatMoney(min, currency, locale, display))
  } else {
    amount = labels.upTo(formatMoney(max as number, currency, locale, display))
  }

  const period = salary.period ? ` / ${labels.per[salary.period]}` : ''
  const kind = salary.kind ? ` (${labels.kind[salary.kind]})` : ''
  return `${amount}${period}${kind}`
}

const PERIODS_PER_YEAR: Record<'year' | 'month' | 'week', number> = { year: 1, month: 12, week: 52 }

// An amount per period, as an amount per year.
export function annualMinor(
  minor: number,
  period: SalaryPeriod,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS
): number {
  if ('day' === period) {
    return Math.round(minor * assumptions.workingDaysPerYear)
  }
  if ('hour' === period) {
    return Math.round(minor * assumptions.hoursPerDay * assumptions.workingDaysPerYear)
  }
  return Math.round(minor * PERIODS_PER_YEAR[period])
}

// What one unit of a currency is worth in the home currency, from the rates of the user. The home currency is worth 1.
function worth(code: string, home: string, rates: Record<string, number>): number | null {
  if (code === home) {
    return 1
  }
  const rate = rates[code]
  return 'number' === typeof rate && 0 < rate && Number.isFinite(rate) ? rate : null
}

// An amount in minor units of a currency, in minor units of another one. Null when a rate is missing.
export function convertMinor(
  minor: number,
  from: string,
  to: string,
  home: string,
  rates: Record<string, number>
): number | null {
  if (from === to) {
    return minor
  }
  const source = worth(from, home, rates)
  const target = worth(to, home, rates)
  if (null === source || null === target) {
    return null
  }
  return Math.round(toMinor((fromMinor(minor, from) * source) / target, to))
}

export interface Conversion {
  home: string
  rates: Record<string, number>
  assumptions: Assumptions
}

// The salary of an offer as a range per year in the home currency, or null when it cannot be done (no period, or no rate).
export function salaryPerYearInHome(
  salary: Salary,
  { home, rates, assumptions }: Conversion
): { min: number | null; max: number | null } | null {
  if (null === salary.currency || null === salary.period || '' === home) {
    return null
  }
  const currency = salary.currency
  const period = salary.period
  const toHome = (value: number | null) => {
    if (null === value) {
      return null
    }
    return convertMinor(annualMinor(value, period, assumptions), currency, home, home, rates)
  }
  const min = toHome(salary.min)
  const max = toHome(salary.max)
  if ((null !== salary.min && null === min) || (null !== salary.max && null === max)) {
    return null
  }
  return { min, max }
}

// One number to compare offers by: the middle of the range, or the one end that is known.
export function comparableSalary(salary: Salary, conversion: Conversion): number | null {
  const converted = salaryPerYearInHome(salary, conversion)
  if (!converted) {
    return null
  }
  const { min, max } = converted
  if (null !== min && null !== max) {
    return Math.round((min + max) / 2)
  }
  return min ?? max
}
