import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { PayProfile } from '../../src/models'
import type { PayLine } from '../../src/models/PayProfile'
import {
  PayProfileError,
  computeNet,
  deletePayProfile,
  duplicatePayProfile,
  normalizeLines,
  progressive,
  savePayProfile,
} from '../../src/services/netPay'
import { PAY_EXAMPLES } from '../../src/services/payExamples'
import { freshStore } from './helpers'

const SCALE = [
  { upTo: 10000, rate: 0 },
  { upTo: 30000, rate: 10 },
  { upTo: null, rate: 40 },
]

const failsWith = (code: string, action: () => unknown) => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(PayProfileError)
    expect((error as PayProfileError).code).toBe(code)
    return
  }
  throw new Error(`Expected a PayProfileError (${code}).`)
}

describe('progressive', () => {
  it('takes each slice at its own rate', () => {
    expect(progressive(0, SCALE)).toBe(0)
    expect(progressive(10000, SCALE)).toBe(0)
    expect(progressive(20000, SCALE)).toBe(1000)
    expect(progressive(30000, SCALE)).toBe(2000)
    expect(progressive(50000, SCALE)).toBe(2000 + 8000)
  })

  it('handles a scale with a single slice and an empty one', () => {
    expect(progressive(1000, [{ upTo: null, rate: 20 }])).toBe(200)
    expect(progressive(1000, [])).toBe(0)
  })
})

describe('computeNet', () => {
  it('takes a flat rate from the gross', () => {
    const result = computeNet(4_000_000, {
      currency: 'EUR',
      lines: [{ label: 'Tax', base: 'gross', kind: 'rate', rate: 25 }],
    })
    expect(result).toMatchObject({ gross: 4_000_000, deductions: 1_000_000, net: 3_000_000, takenShare: 0.25 })
    expect(result.lines).toEqual([{ label: 'Tax', amount: 1_000_000 }])
  })

  it('takes a later line from what is left, not from the gross', () => {
    const lines: PayLine[] = [
      { label: 'Contributions', base: 'gross', kind: 'rate', rate: 20 },
      { label: 'Tax', base: 'running', kind: 'rate', rate: 10 },
    ]
    const result = computeNet(10_000_00, { currency: 'EUR', lines })
    // 10 000: 2 000 of contributions, then 10% of 8 000.
    expect(result.lines.map((line) => line.amount)).toEqual([2_000_00, 800_00])
    expect(result.net).toBe(7_200_00)
  })

  it('takes a line on a share of its base', () => {
    const result = computeNet(10_000_00, {
      currency: 'EUR',
      lines: [{ label: 'Tax on 50%', base: 'gross', kind: 'rate', rate: 20, share: 50 }],
    })
    expect(result.deductions).toBe(1_000_00)
  })

  it('applies a scale to the base', () => {
    const result = computeNet(50_000_00, {
      currency: 'EUR',
      lines: [{ label: 'Income tax', base: 'gross', kind: 'brackets', brackets: SCALE }],
    })
    expect(result.deductions).toBe(10_000_00)
    expect(result.net).toBe(40_000_00)
  })

  it('adds up: what is shown is what is taken, to the cent', () => {
    const lines: PayLine[] = [
      { label: 'A', base: 'gross', kind: 'rate', rate: 22.33 },
      { label: 'B', base: 'running', kind: 'rate', rate: 7.77 },
    ]
    const result = computeNet(3_333_33, { currency: 'EUR', lines })
    expect(result.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(result.deductions)
    expect(result.gross - result.deductions).toBe(result.net)
  })

  it('works in a currency with no minor unit', () => {
    const result = computeNet(5_000_000, {
      currency: 'JPY',
      lines: [{ label: 'Tax', base: 'gross', kind: 'rate', rate: 20 }],
    })
    expect(result).toMatchObject({ deductions: 1_000_000, net: 4_000_000 })
  })

  it('gives the gross back with no line, and copes with a gross of zero', () => {
    expect(computeNet(1000, { currency: 'EUR', lines: [] })).toMatchObject({ net: 1000, deductions: 0, takenShare: 0 })
    expect(
      computeNet(0, { currency: 'EUR', lines: [{ label: 'x', base: 'gross', kind: 'rate', rate: 30 }] })
    ).toMatchObject({ net: 0, takenShare: 0 })
  })

  it('gives the figures of the example of France for a gross of 40 000', () => {
    const example = PAY_EXAMPLES.find((candidate) => 'fr-not-executive' === candidate.key)
    const result = computeNet(40_000_00, example as never)
    // 22% of contributions: 8 800. Tax: 90% of 31 200 is 28 080; above 11 497 at 11%: 1 824,13.
    expect(result.lines.map((line) => line.amount)).toEqual([8_800_00, 1_824_13])
    expect(result.net).toBe(29_375_87)
  })

  it('has examples that are all valid profiles', () => {
    for (const example of PAY_EXAMPLES) {
      expect(() => normalizeLines(example.lines)).not.toThrow()
      expect(computeNet(30_000_00, example).net).toBeLessThan(30_000_00)
    }
    expect(new Set(PAY_EXAMPLES.map((example) => example.key)).size).toBe(PAY_EXAMPLES.length)
  })
})

describe('normalizeLines', () => {
  const rate: PayLine = { label: 'Tax', base: 'gross', kind: 'rate', rate: 20 }

  it('keeps a good line as it is, and trims the label', () => {
    expect(normalizeLines([{ ...rate, label: '  Tax  ' }])).toEqual([rate])
    expect(normalizeLines(undefined)).toEqual([])
    expect(normalizeLines([{ ...rate, share: 90 }])).toEqual([{ ...rate, share: 90 }])
  })

  it('refuses a line without a label, a wrong base or kind, and a rate out of range', () => {
    failsWith('label', () => normalizeLines([{ ...rate, label: ' ' }]))
    failsWith('base', () => normalizeLines([{ ...rate, base: 'net' }]))
    failsWith('kind', () => normalizeLines([{ ...rate, kind: 'magic' }]))
    failsWith('rate', () => normalizeLines([{ ...rate, rate: -1 }]))
    failsWith('rate', () => normalizeLines([{ ...rate, rate: 101 }]))
    failsWith('rate', () => normalizeLines([{ ...rate, rate: 'ten' }]))
    failsWith('share', () => normalizeLines([{ ...rate, share: 0 }]))
    failsWith('share', () => normalizeLines([{ ...rate, share: 150 }]))
  })

  it('refuses a scale that is empty, whose limits do not go up, or whose last slice has a limit', () => {
    const scale = (brackets: unknown) => [{ label: 'Tax', base: 'gross', kind: 'brackets', brackets }]
    failsWith('brackets', () => normalizeLines(scale([])))
    failsWith('order', () =>
      normalizeLines(
        scale([
          { upTo: 20000, rate: 10 },
          { upTo: 10000, rate: 20 },
          { upTo: null, rate: 30 },
        ])
      )
    )
    failsWith('order', () =>
      normalizeLines(
        scale([
          { upTo: 10000, rate: 10 },
          { upTo: 10000, rate: 20 },
          { upTo: null, rate: 30 },
        ])
      )
    )
    failsWith('order', () =>
      normalizeLines(
        scale([
          { upTo: 10000, rate: 10 },
          { upTo: 20000, rate: 20 },
        ])
      )
    )
    failsWith('order', () =>
      normalizeLines(
        scale([
          { upTo: null, rate: 10 },
          { upTo: null, rate: 20 },
        ])
      )
    )
    failsWith('rate', () => normalizeLines(scale([{ upTo: null, rate: 200 }])))
    expect(normalizeLines(scale([{ upTo: null, rate: 10 }]))[0]).toMatchObject({ brackets: [{ upTo: null, rate: 10 }] })
  })
})

describe('pay profiles', () => {
  beforeEach(() => {
    freshStore()
  })

  const input = {
    name: ' My profile ',
    country: 'FR',
    status: ' Employee ',
    currency: 'EUR',
    lines: [{ label: 'Tax', base: 'gross', kind: 'rate', rate: 20 }],
    notes: '',
  }

  it('saves a profile, in its canonical form', () => {
    const profile = savePayProfile(input)
    expect(profile).toMatchObject({
      name: 'My profile',
      country: 'FR',
      status: 'Employee',
      currency: 'EUR',
      notes: null,
    })
    expect(useRepo(PayProfile).all()).toHaveLength(1)
  })

  it('changes a profile, and deletes it', () => {
    const profile = savePayProfile(input)
    savePayProfile({ ...input, name: 'Renamed' }, profile.id)
    expect(
      useRepo(PayProfile)
        .all()
        .map((candidate) => candidate.name)
    ).toEqual(['Renamed'])
    deletePayProfile(profile.id)
    expect(useRepo(PayProfile).all()).toHaveLength(0)
  })

  it('refuses a profile without a name or with a currency that does not exist, and saves nothing', () => {
    failsWith('name', () => savePayProfile({ ...input, name: '  ' }))
    failsWith('currency', () => savePayProfile({ ...input, currency: 'XXX1' }))
    failsWith('rate', () =>
      savePayProfile({ ...input, lines: [{ label: 'x', base: 'gross', kind: 'rate', rate: 500 }] })
    )
    expect(useRepo(PayProfile).all()).toHaveLength(0)
  })

  it('duplicates a profile with its own lines', () => {
    const profile = savePayProfile(input)
    const copy = duplicatePayProfile(profile.id, 'Copy')
    expect(copy).toMatchObject({ name: 'Copy', currency: 'EUR' })
    expect(copy?.id).not.toBe(profile.id)
    expect(copy?.lines).toEqual(profile.lines)
    expect(duplicatePayProfile('nothing', 'x')).toBeNull()
  })
})
