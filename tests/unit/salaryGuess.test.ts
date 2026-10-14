import { describe, expect, it } from 'vitest'
import { completeFromText, completeSalary, guessPeriod } from '../../src/extraction/salaryGuess'
import { kindFromWords, periodFromWords, salaryFromText } from '../../src/extraction/salaryText'
import type { Salary } from '../../src/utils/money'

const salary = (min: number | null, max: number | null, currency = 'EUR', over: Partial<Salary> = {}): Salary => ({
  min: null === min ? null : min * 100,
  max: null === max ? null : max * 100,
  currency,
  period: null,
  kind: null,
  ...over,
})

describe('the words that say gross, net and the period', () => {
  it('reads gross and net in French and English, gross first', () => {
    expect(kindFromWords('40 k€ brut annuel')).toBe('gross')
    expect(kindFromWords('£50,000 gross')).toBe('gross')
    expect(kindFromWords('35K net')).toBe('net')
    expect(kindFromWords('brut / net')).toBe('gross')
    expect(kindFromWords('internet')).toBeNull()
    expect(kindFromWords('3000 euros')).toBeNull()
  })

  it('reads the period from its words', () => {
    expect(periodFromWords('brut annuel')).toBe('year')
    expect(periodFromWords('3000 € brut mensuel')).toBe('month')
    expect(periodFromWords('paid monthly')).toBe('month')
    expect(periodFromWords('taux horaire')).toBe('hour')
    expect(periodFromWords('à négocier')).toBeNull()
  })

  it('goes into the salary read from a line of text', () => {
    expect(salaryFromText('40 k€ brut annuel')).toMatchObject({ min: 4_000_000, kind: 'gross', period: 'year' })
    expect(salaryFromText('3000 € brut mensuel')).toMatchObject({ min: 300_000, kind: 'gross', period: 'month' })
    expect(salaryFromText('45 000 € par an')).toMatchObject({ period: 'year', kind: null })
  })
})

describe('the period of a salary that does not say it', () => {
  it('is a year by default, with the exact value that makes it sure for a month or an hour', () => {
    expect(guessPeriod(salary(40_000, 40_000))).toBe('year')
    expect(guessPeriod(salary(35_000, 45_000))).toBe('year')
    expect(guessPeriod(salary(3000, 3000))).toBe('month')
    expect(guessPeriod(salary(2500, 3500))).toBe('month')
    expect(guessPeriod(salary(15, 18))).toBe('hour')
    expect(guessPeriod(salary(40_000, 40_000, 'USD'))).toBe('year')
    // A USD figure that could be a month is still a year: nothing tells otherwise.
    expect(guessPeriod(salary(4000, 4000, 'USD'))).toBe('year')
  })

  it('does not move across the line between a month and a year in the middle of a range', () => {
    // From a monthly pay to a yearly figure is not a monthly range.
    expect(guessPeriod(salary(3000, 50_000))).toBe('year')
    expect(guessPeriod(salary(null, 3000))).toBe('month')
  })

  it('keeps a period that is said, and says nothing for a salary with no amount', () => {
    expect(guessPeriod(salary(3000, 3000, 'EUR', { period: 'year' }))).toBe('year')
    expect(guessPeriod(salary(null, null))).toBeNull()
    expect(guessPeriod({ ...salary(1, 1), currency: null })).toBeNull()
  })
})

describe('what the text around the same amount adds', () => {
  const text = 'Rémunération : à partir de 40 k€ brut annuel selon profil. Prime de 2000 € net.'

  it('takes gross and the year from the mention that has the same amount', () => {
    expect(completeFromText(salary(40_000, 40_000), text)).toMatchObject({ kind: 'gross', period: 'year' })
  })

  it('does not take a word that belongs to another amount', () => {
    // 2000 € is "net" in the text, but the salary is 40 000.
    expect(completeFromText(salary(40_000, 40_000), 'Prime de 2000 € net. Salaire 40 k€')).toMatchObject({ kind: null })
  })

  it("leaves what is said alone and ignores a currency that is not the salary's", () => {
    expect(completeFromText(salary(40_000, 40_000, 'EUR', { kind: 'net' }), text).kind).toBe('net')
    expect(completeFromText(salary(40_000, 40_000, 'USD'), text)).toMatchObject({ kind: null, period: null })
    expect(completeFromText(salary(40_000, 40_000), undefined).kind).toBeNull()
  })

  it('completes the kind, then guesses the period', () => {
    expect(completeSalary(salary(3000, 3000), 'Salaire 3000 € brut')).toMatchObject({ kind: 'gross', period: 'month' })
    expect(completeSalary(salary(40_000, 40_000), '')).toMatchObject({ kind: null, period: 'year' })
  })
})
