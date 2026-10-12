import { describe, expect, it } from 'vitest'
import {
  type Salary,
  type SalaryLabels,
  annualMinor,
  comparableSalary,
  convertMinor,
  currencyDigits,
  currencyName,
  describeSalary,
  formatMoney,
  fromMinor,
  isCurrency,
  listCurrencies,
  minorToInput,
  salaryPerYearInHome,
  toMinor,
} from '../../src/utils/money'

const labels: SalaryLabels = {
  from: (amount) => `from ${amount}`,
  upTo: (amount) => `up to ${amount}`,
  per: { year: 'year', month: 'month', week: 'week', day: 'day', hour: 'hour' },
  kind: { gross: 'gross', net: 'net' },
}

const salary = (overrides: Partial<Salary>): Salary => ({
  min: null,
  max: null,
  currency: 'EUR',
  period: 'year',
  kind: null,
  ...overrides,
})

describe('currencies', () => {
  it('knows the digits of a currency', () => {
    expect(currencyDigits('EUR')).toBe(2)
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(3)
  })

  it('knows a currency code, and refuses what is not one', () => {
    expect(isCurrency('EUR')).toBe(true)
    expect(isCurrency('eur')).toBe(false)
    expect(isCurrency('EURO')).toBe(false)
    expect(isCurrency(978)).toBe(false)
    expect(isCurrency('')).toBe(false)
  })

  it('lists the currencies, with the main ones', () => {
    for (const code of ['EUR', 'USD', 'GBP', 'JPY', 'CHF']) {
      expect(listCurrencies()).toContain(code)
    }
  })

  it('names a currency in a language', () => {
    expect(currencyName('EUR', 'en')).toBe('Euro')
    expect(currencyName('EUR', 'fr')).toBe('euro')
  })
})

describe('minor units', () => {
  it.each([
    ['45000', 'EUR', 4_500_000],
    ['19.99', 'EUR', 1999],
    ['19,99', 'EUR', 1999],
    [45000.5, 'EUR', 4_500_050],
    ['5000', 'JPY', 5000],
    ['1.5', 'KWD', 1500],
    // The classic floating point trap: 1.005 * 100 is 100.49999999999999.
    ['1.005', 'EUR', 101],
  ])('%s %s is %i minor units', (amount, code, minor) => {
    expect(toMinor(amount, code)).toBe(minor)
  })

  it('refuses what is not an amount', () => {
    expect(() => toMinor('abc', 'EUR')).toThrow(/Not an amount/)
    expect(() => toMinor('', 'EUR')).toThrow(/Not an amount/)
  })

  it('goes back and forth', () => {
    expect(fromMinor(4_500_050, 'EUR')).toBe(45_000.5)
    expect(minorToInput(4_500_000, 'EUR')).toBe('45000')
    expect(minorToInput(1999, 'EUR')).toBe('19.99')
    expect(minorToInput(null, 'EUR')).toBe('')
    expect(minorToInput(100, null)).toBe('')
  })
})

describe('showing money', () => {
  it('writes an amount with the format of the language and of the currency', () => {
    expect(formatMoney(4_500_000, 'EUR', 'en')).toBe('€45,000')
    expect(formatMoney(4_500_000, 'USD', 'en')).toBe('$45,000')
    expect(formatMoney(5000, 'JPY', 'ja')).toMatch(/5,000/)
    expect(formatMoney(4_500_000, 'EUR', 'fr')).toMatch(/45\s000\s€/)
    expect(formatMoney(4_500_000, 'EUR', 'de')).toMatch(/45\.000\s€/)
  })

  it('keeps the cents when there are some, and hides them when there are none', () => {
    expect(formatMoney(1999, 'EUR', 'en')).toBe('€19.99')
    expect(formatMoney(2000, 'EUR', 'en')).toBe('€20')
  })

  it('tells the dollars apart in a language that has more than one', () => {
    expect(formatMoney(100_000, 'USD', 'en')).toBe('$1,000')
    expect(formatMoney(100_000, 'CAD', 'en')).toBe('CA$1,000')
    expect(formatMoney(100_000, 'AUD', 'en')).toBe('A$1,000')
  })

  it('shows the code or the name when asked', () => {
    expect(formatMoney(4_500_000, 'USD', 'en', 'code')).toMatch(/USD\s?45,000/)
    expect(formatMoney(4_500_000, 'USD', 'en', 'name')).toMatch(/45,000 US dollars/)
  })
})

describe('describing a salary', () => {
  it('shows a range with its period and its kind', () => {
    expect(describeSalary(salary({ min: 4_500_000, max: 5_500_000, kind: 'gross' }), 'en', 'symbol', labels)).toBe(
      '€45,000 – €55,000 / year (gross)'
    )
  })

  it('shows one end when only one is known', () => {
    expect(describeSalary(salary({ min: 9_000_000, currency: 'USD' }), 'en', 'symbol', labels)).toBe(
      'from $90,000 / year'
    )
    expect(describeSalary(salary({ max: 40_000, currency: 'GBP', period: 'day' }), 'en', 'symbol', labels)).toBe(
      'up to £400 / day'
    )
  })

  it('shows one amount when the two ends are the same', () => {
    expect(describeSalary(salary({ min: 5_000_000, max: 5_000_000 }), 'en', 'symbol', labels)).toBe('€50,000 / year')
  })

  it('shows nothing when there is no amount or no currency', () => {
    expect(describeSalary(salary({}), 'en', 'symbol', labels)).toBe('')
    expect(describeSalary(salary({ min: 100, currency: null }), 'en', 'symbol', labels)).toBe('')
  })

  it('has no period or kind when none is set', () => {
    expect(describeSalary(salary({ min: 4_500_000, max: 5_500_000, period: null }), 'en', 'symbol', labels)).toBe(
      '€45,000 – €55,000'
    )
  })
})

describe('comparing salaries', () => {
  const assumptions = { workingDaysPerYear: 220, hoursPerDay: 7 }

  it('turns a period into a year', () => {
    expect(annualMinor(100, 'year', assumptions)).toBe(100)
    expect(annualMinor(100, 'month', assumptions)).toBe(1200)
    expect(annualMinor(100, 'week', assumptions)).toBe(5200)
    expect(annualMinor(100, 'day', assumptions)).toBe(22_000)
    expect(annualMinor(100, 'hour', assumptions)).toBe(154_000)
  })

  it('converts through the home currency, with the digits of each currency', () => {
    const rates = { USD: 0.9, JPY: 0.006 }
    // 100 USD at 0.9 is 90 EUR.
    expect(convertMinor(10_000, 'USD', 'EUR', 'EUR', rates)).toBe(9000)
    // 10 000 JPY (no minor unit) at 0.006 is 60 EUR, which is 6000 cents.
    expect(convertMinor(10_000, 'JPY', 'EUR', 'EUR', rates)).toBe(6000)
    // From the home currency to another: 90 EUR is 100 USD.
    expect(convertMinor(9000, 'EUR', 'USD', 'EUR', rates)).toBe(10_000)
    expect(convertMinor(500, 'EUR', 'EUR', 'EUR', rates)).toBe(500)
  })

  it('does not guess a rate that was not given', () => {
    expect(convertMinor(10_000, 'CHF', 'EUR', 'EUR', {})).toBeNull()
    expect(convertMinor(10_000, 'CHF', 'EUR', 'EUR', { CHF: 0 })).toBeNull()
    expect(convertMinor(10_000, 'CHF', 'EUR', 'EUR', { CHF: -1 })).toBeNull()
  })

  it('gives a salary per year in the home currency', () => {
    const conversion = { home: 'EUR', rates: { USD: 0.9 }, assumptions }
    const monthly = salary({ min: 400_000, max: 500_000, currency: 'USD', period: 'month' })

    expect(salaryPerYearInHome(monthly, conversion)).toEqual({ min: 4_320_000, max: 5_400_000 })
    expect(comparableSalary(monthly, conversion)).toBe(4_860_000)
  })

  it('cannot compare without a period, a home currency or a rate', () => {
    const conversion = { home: 'EUR', rates: { USD: 0.9 }, assumptions }

    expect(comparableSalary(salary({ min: 100, currency: 'USD', period: null }), conversion)).toBeNull()
    expect(comparableSalary(salary({ min: 100, currency: 'USD' }), { ...conversion, home: '' })).toBeNull()
    expect(comparableSalary(salary({ min: 100, currency: 'CHF' }), conversion)).toBeNull()
  })

  it('compares one known end as it is', () => {
    const conversion = { home: 'EUR', rates: {}, assumptions }
    expect(comparableSalary(salary({ min: 5_000_000 }), conversion)).toBe(5_000_000)
  })
})
