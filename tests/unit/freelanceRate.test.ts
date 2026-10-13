import { describe, expect, it } from 'vitest'
import { type FreelanceInput, netFromTurnover, ratesOf, turnoverForNet } from '../../src/services/freelanceRate'
import { PAY_EXAMPLES } from '../../src/services/payExamples'

const base = (changes: Partial<FreelanceInput> = {}): FreelanceInput => ({
  currency: 'EUR',
  days: 200,
  hoursPerDay: 7,
  costs: 0,
  chargesOn: 'turnover',
  profile: null,
  flatRate: 22,
  ...changes,
})

const scale = {
  currency: 'EUR',
  lines: [
    {
      label: 'Tax',
      base: 'gross' as const,
      kind: 'brackets' as const,
      brackets: [
        { upTo: 10_000, rate: 0 },
        { upTo: 40_000, rate: 20 },
        { upTo: null, rate: 40 },
      ],
    },
  ],
}

describe('netFromTurnover', () => {
  it('takes a flat rate from the turnover, and the costs', () => {
    const result = netFromTurnover(100_000_00, base({ costs: 10_000_00 }))
    // 22% of the turnover (the costs cannot be deducted), then the costs.
    expect(result).toMatchObject({ turnover: 100_000_00, costs: 10_000_00, chargesTotal: 22_000_00, net: 68_000_00 })
  })

  it('takes the charges on the profit when the costs can be deducted', () => {
    const result = netFromTurnover(100_000_00, base({ costs: 10_000_00, chargesOn: 'profit' }))
    // 22% of 90 000.
    expect(result).toMatchObject({ chargesTotal: 19_800_00, net: 70_200_00 })
  })

  it('does not take charges on a loss, and the net is the loss', () => {
    const result = netFromTurnover(5_000_00, base({ costs: 8_000_00, chargesOn: 'profit' }))
    expect(result).toMatchObject({ chargesTotal: 0, net: -3_000_00 })
  })

  it('uses a profile, with its scale', () => {
    const result = netFromTurnover(50_000_00, base({ profile: scale }))
    // 0 on 10 000, 20% of 30 000, 40% of 10 000.
    expect(result.chargesTotal).toBe(6_000_00 + 4_000_00)
    expect(result.net).toBe(40_000_00)
    expect(result.charges).toEqual([{ label: 'Tax', amount: 10_000_00 }])
  })
})

describe('turnoverForNet', () => {
  it('finds the turnover that leaves the net wanted, with a flat rate and costs', () => {
    const input = base({ costs: 6_000_00 })
    const turnover = turnoverForNet(30_000_00, input) as number
    // net = turnover x (1 - 0.22) - costs: turnover = (30 000 + 6 000) / 0.78.
    expect(turnover).toBeGreaterThanOrEqual(Math.floor(36_000_00 / 0.78))
    expect(turnover).toBeLessThanOrEqual(Math.ceil(36_000_00 / 0.78) + 1)
  })

  it('is the smallest turnover that is enough', () => {
    for (const input of [base(), base({ costs: 5_000_00, chargesOn: 'profit' }), base({ profile: scale })]) {
      const turnover = turnoverForNet(25_000_00, input) as number
      expect(netFromTurnover(turnover, input).net).toBeGreaterThanOrEqual(25_000_00)
      expect(netFromTurnover(turnover - 1, input).net).toBeLessThan(25_000_00)
    }
  })

  it('works with a scale, which no formula would give', () => {
    const input = base({ profile: scale })
    const turnover = turnoverForNet(40_000_00, input) as number
    // From the case above: 50 000 of turnover leaves 40 000.
    expect(turnover).toBe(50_000_00)
  })

  it('works with the example of the freelance of France', () => {
    const example = PAY_EXAMPLES.find((candidate) => 'fr-freelance' === candidate.key)
    const input = base({ profile: example as never, costs: 3_000_00 })
    const turnover = turnoverForNet(36_000_00, input) as number
    expect(netFromTurnover(turnover, input).net).toBeGreaterThanOrEqual(36_000_00)
  })

  it('wants a turnover of zero for nothing, and no more than the costs for a net of zero', () => {
    expect(turnoverForNet(0, base())).toBe(0)
    const turnover = turnoverForNet(0, base({ costs: 4_000_00 })) as number
    expect(netFromTurnover(turnover, base({ costs: 4_000_00 })).net).toBeGreaterThanOrEqual(0)
    expect(netFromTurnover(turnover - 1, base({ costs: 4_000_00 })).net).toBeLessThan(0)
  })

  it('says it cannot be done when the charges take everything', () => {
    const everything = {
      currency: 'EUR',
      lines: [{ label: 'All', base: 'gross' as const, kind: 'rate' as const, rate: 100 }],
    }
    expect(turnoverForNet(10_000_00, base({ profile: everything }))).toBeNull()
  })
})

describe('ratesOf', () => {
  it('divides the turnover by the days billed, and by the hours of a day, rounding up so that the net is kept', () => {
    expect(ratesOf(120_000_00, 200, 7)).toEqual({ daily: 600_00, hourly: 85_72 })
    expect(ratesOf(100_000, 3, 8)).toEqual({ daily: 33_334, hourly: 4_167 })
  })

  it('gives nothing without days', () => {
    expect(ratesOf(100_000, 0, 7)).toEqual({ daily: 0, hourly: 0 })
    expect(ratesOf(100_000, 200, 0).hourly).toBe(0)
  })
})
