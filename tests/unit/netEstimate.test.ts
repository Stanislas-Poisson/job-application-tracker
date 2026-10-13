import { describe, expect, it } from 'vitest'
import { estimateNet } from '../../src/services/netEstimate'
import { formatBrackets, parseBrackets } from '../../src/services/netPay'
import type { Salary } from '../../src/utils/money'

const assumptions = { workingDaysPerYear: 220, hoursPerDay: 7 }
const profile = {
  name: 'Flat 20',
  currency: 'EUR',
  lines: [{ label: 'Tax', base: 'gross' as const, kind: 'rate' as const, rate: 20 }],
}
const salary = (changes: Partial<Salary> = {}): Salary => ({
  min: 4_000_000,
  max: 5_000_000,
  currency: 'EUR',
  period: 'year',
  kind: 'gross',
  ...changes,
})

describe('estimateNet', () => {
  it('applies the profile to each end of the range', () => {
    const result = estimateNet(salary(), profile, assumptions)
    expect(result).toMatchObject({ profile: 'Flat 20', currency: 'EUR', assumedGross: false })
    if ('string' === typeof result) throw new Error('an estimate was expected')
    expect([result.low.net, result.high.net]).toEqual([3_200_000, 4_000_000])
  })

  it('turns a monthly, a daily and an hourly pay into a pay per year first', () => {
    const net = (changes: Partial<Salary>) => {
      const result = estimateNet(salary(changes), profile, assumptions)
      if ('string' === typeof result) throw new Error('an estimate was expected')
      return result.low.gross
    }
    expect(net({ min: 400_000, max: 400_000, period: 'month' })).toBe(4_800_000)
    expect(net({ min: 50_000, max: 50_000, period: 'day' })).toBe(11_000_000)
    expect(net({ min: 5_000, max: 5_000, period: 'hour' })).toBe(7_700_000)
  })

  it('uses the one figure there is, and orders a range written the wrong way', () => {
    const only = estimateNet(salary({ min: null, max: 6_000_000 }), profile, assumptions)
    const reversed = estimateNet(salary({ min: 5_000_000, max: 4_000_000 }), profile, assumptions)
    if ('string' === typeof only || 'string' === typeof reversed) throw new Error('an estimate was expected')
    expect([only.low.gross, only.high.gross]).toEqual([6_000_000, 6_000_000])
    expect([reversed.low.gross, reversed.high.gross]).toEqual([4_000_000, 5_000_000])
  })

  it('takes a pay that does not say gross or net for gross, and says so', () => {
    const result = estimateNet(salary({ kind: null }), profile, assumptions)
    expect(result).toMatchObject({ assumedGross: true })
  })

  it('says why there is no estimate, instead of guessing', () => {
    expect(estimateNet(salary(), null, assumptions)).toBe('no-profile')
    expect(estimateNet(salary({ min: null, max: null }), profile, assumptions)).toBe('no-salary')
    expect(estimateNet(salary({ currency: null }), profile, assumptions)).toBe('no-salary')
    expect(estimateNet(salary({ period: null }), profile, assumptions)).toBe('no-period')
    expect(estimateNet(salary({ kind: 'net' }), profile, assumptions)).toBe('is-net')
    expect(estimateNet(salary({ currency: 'USD' }), profile, assumptions)).toBe('currency')
  })
})

describe('the text of a scale', () => {
  it('is read one slice per line, with the last one unlimited', () => {
    expect(parseBrackets('11497 0\n29315 11\n∞ 45')).toEqual([
      { upTo: 11497, rate: 0 },
      { upTo: 29315, rate: 11 },
      { upTo: null, rate: 45 },
    ])
  })

  it('takes a comma or a semicolon for the space, a decimal comma, and several ways to say no limit', () => {
    expect(parseBrackets('10000;5,5\n20000, 10\ninf 30')).toEqual([
      { upTo: 10000, rate: 5.5 },
      { upTo: 20000, rate: 10 },
      { upTo: null, rate: 30 },
    ])
    expect(parseBrackets('* 25')).toEqual([{ upTo: null, rate: 25 }])
    expect(parseBrackets('25')).toEqual([{ upTo: null, rate: 25 }])
    expect(parseBrackets('infinity 25\n')).toEqual([{ upTo: null, rate: 25 }])
  })

  it('gives nothing for nothing, and a number that is not one is left for the checks to refuse', () => {
    expect(parseBrackets('   \n\n')).toEqual([])
    const [bad] = parseBrackets('lots 10')
    expect(Number.isNaN(bad?.upTo)).toBe(true)
  })

  it('is written back the way it is read', () => {
    const scale = [
      { upTo: 11497, rate: 0 },
      { upTo: 29315, rate: 11 },
      { upTo: null, rate: 45 },
    ]
    expect(formatBrackets(scale)).toBe('11497 0\n29315 11\n∞ 45')
    expect(parseBrackets(formatBrackets(scale))).toEqual(scale)
  })
})
