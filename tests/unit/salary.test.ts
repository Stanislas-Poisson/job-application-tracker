import { describe, expect, it } from 'vitest'
import { SalaryError, type SalaryForm, salaryFromForm } from '../../src/services/salary'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

const form = (overrides: Partial<SalaryForm>): SalaryForm => ({
  min: '',
  max: '',
  currency: '',
  period: '',
  kind: '',
  ...overrides,
})

const codeOf = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    return error instanceof SalaryError ? error.code : 'other'
  }
  return null
}

describe('the salary form', () => {
  it('gives the fields of the offer, in minor units', () => {
    expect(
      salaryFromForm(form({ min: '45000', max: '55000.5', currency: 'EUR', period: 'year', kind: 'gross' }))
    ).toEqual({
      salaryMin: 4_500_000,
      salaryMax: 5_500_050,
      salaryCurrency: 'EUR',
      salaryPeriod: 'year',
      salaryKind: 'gross',
    })
  })

  it('takes the numbers that a number field gives, and an empty one that gives null', () => {
    expect(salaryFromForm(form({ min: 4000, max: null, currency: 'USD', period: 'month' }))).toMatchObject({
      salaryMin: 400_000,
      salaryMax: null,
      salaryPeriod: 'month',
    })
  })

  it('takes one end only', () => {
    expect(salaryFromForm(form({ min: '90000', currency: 'USD' }))).toMatchObject({
      salaryMin: 9_000_000,
      salaryMax: null,
    })
  })

  it('clears the salary when the amounts are empty, and keeps no period or kind', () => {
    expect(salaryFromForm(form({ currency: 'EUR', period: 'year', kind: 'net' }))).toEqual({
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: 'EUR',
      salaryPeriod: null,
      salaryKind: null,
    })
  })

  it('wants a currency with an amount', () => {
    expect(codeOf(() => salaryFromForm(form({ min: '100' })))).toBe('currencyRequired')
    expect(codeOf(() => salaryFromForm(form({ min: '100', currency: 'XYZZY' })))).toBe('currencyRequired')
  })

  it('refuses an amount that is not a number or is negative', () => {
    expect(codeOf(() => salaryFromForm(form({ min: 'lots', currency: 'EUR' })))).toBe('amount')
    expect(codeOf(() => salaryFromForm(form({ min: '-5', currency: 'EUR' })))).toBe('amount')
  })

  it('refuses a lowest salary above the highest', () => {
    expect(codeOf(() => salaryFromForm(form({ min: '60000', max: '50000', currency: 'EUR' })))).toBe('order')
  })

  it('refuses a period or a kind that is not in the lists', () => {
    expect(codeOf(() => salaryFromForm(form({ min: '1', currency: 'EUR', period: 'decade' })))).toBe('period')
    expect(codeOf(() => salaryFromForm(form({ min: '1', currency: 'EUR', kind: 'tax-free' })))).toBe('kind')
  })
})

describe('the money settings', () => {
  it('has the defaults', () => {
    expect(normalizeSettings(undefined)).toMatchObject({
      homeCurrency: '',
      currencyDisplay: 'symbol',
      rates: {},
      workingDaysPerYear: 220,
      hoursPerDay: 7,
    })
  })

  it('keeps valid values', () => {
    const settings = normalizeSettings({
      homeCurrency: 'EUR',
      currencyDisplay: 'code',
      rates: { USD: 0.9 },
      workingDaysPerYear: 200,
      hoursPerDay: 7.5,
    })
    expect(settings).toMatchObject({
      homeCurrency: 'EUR',
      currencyDisplay: 'code',
      workingDaysPerYear: 200,
      hoursPerDay: 7.5,
    })
    expect(settings.rates).toEqual({ USD: 0.9 })
  })

  it('drops what is not valid and keeps the rest', () => {
    const settings = normalizeSettings({
      homeCurrency: 'euro',
      currencyDisplay: 'pretty',
      rates: { USD: 0.9, XX: 2, CHF: -1, GBP: 'a lot', JPY: 0.006 },
      workingDaysPerYear: 1000,
      hoursPerDay: 0,
    })
    expect(settings.homeCurrency).toBe('')
    expect(settings.currencyDisplay).toBe('symbol')
    expect(settings.rates).toEqual({ USD: 0.9, JPY: 0.006 })
    expect(settings.workingDaysPerYear).toBe(DEFAULT_SETTINGS.workingDaysPerYear)
    expect(settings.hoursPerDay).toBe(DEFAULT_SETTINGS.hoursPerDay)
  })

  it('does not share the rates between two readings', () => {
    const a = normalizeSettings({})
    a.rates.USD = 1
    expect(normalizeSettings({}).rates).toEqual({})
  })
})
