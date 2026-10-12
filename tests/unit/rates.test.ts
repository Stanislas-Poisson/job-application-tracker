import { describe, expect, it, vi } from 'vitest'
import { refreshRates } from '../../src/services/rates'
import { DEFAULT_SETTINGS, type Settings, normalizeSettings } from '../../src/settings'
import { effectiveRates, parseRates, ratesAreDue } from '../../src/utils/rates'

const now = new Date('2026-10-13T10:00:00Z')
const body = { amount: 1, base: 'EUR', date: '2026-10-12', rates: { USD: 1.25, GBP: 0.8, EU1: 2, JPY: -1 } }
const on = (extra: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  homeCurrency: 'EUR',
  autoRates: true,
  ...extra,
})

describe('parseRates', () => {
  it('turns "1 home = N other" into "1 other = N home" and drops what is not a rate', () => {
    const data = parseRates(body, 'EUR', now)
    expect(data?.rates).toEqual({ USD: 0.8, GBP: 1.25 })
    expect(data).toMatchObject({ home: 'EUR', date: '2026-10-12', fetchedAt: now.toISOString() })
  })

  it('refuses an answer for another currency or without rates', () => {
    expect(parseRates(body, 'USD', now)).toBeNull()
    expect(parseRates({ base: 'EUR', date: '2026-10-12', rates: {} }, 'EUR', now)).toBeNull()
    expect(parseRates(null, 'EUR', now)).toBeNull()
  })
})

describe('effectiveRates', () => {
  const data = parseRates(body, 'EUR', now)

  it('lets the rate typed by the user win over the fetched one', () => {
    const settings = on({ autoRatesData: data, rates: { USD: 0.9 } })
    expect(effectiveRates(settings)).toEqual({ USD: 0.9, GBP: 1.25 })
  })

  it('ignores fetched rates when the switch is off or the home currency changed', () => {
    expect(effectiveRates(on({ autoRates: false, autoRatesData: data }))).toEqual({})
    expect(effectiveRates(on({ homeCurrency: 'USD', autoRatesData: data }))).toEqual({})
  })
})

describe('ratesAreDue', () => {
  const data = parseRates(body, 'EUR', now)

  it('is never due when the switch is off or there is no home currency', () => {
    expect(ratesAreDue(on({ autoRates: false }), now)).toBe(false)
    expect(ratesAreDue(on({ homeCurrency: '' }), now)).toBe(false)
  })

  it('is due when nothing was fetched, after a day, or for another currency', () => {
    expect(ratesAreDue(on(), now)).toBe(true)
    expect(ratesAreDue(on({ autoRatesData: data }), now)).toBe(false)
    expect(ratesAreDue(on({ autoRatesData: data }), new Date('2026-10-14T10:00:01Z'))).toBe(true)
    expect(ratesAreDue(on({ homeCurrency: 'USD', autoRatesData: data }), now)).toBe(true)
  })
})

describe('refreshRates', () => {
  it('keeps the rates it fetched, asking only for the home currency', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => body })
    expect(await refreshRates(on(), update, fetcher, now)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?base=EUR')
    expect((update.mock.calls[0]?.[0] as Partial<Settings>).autoRatesData?.rates).toEqual({ USD: 0.8, GBP: 1.25 })
  })

  it('changes nothing when the service fails, answers badly, or nothing is due', async () => {
    const update = vi.fn()
    const down = vi.fn().mockRejectedValue(new Error('offline'))
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const refused = vi.fn().mockResolvedValue({ ok: false, json: async () => body })
    expect(await refreshRates(on(), update, down, now)).toBe(false)
    expect(await refreshRates(on(), update, bad, now)).toBe(false)
    expect(await refreshRates(on(), update, refused, now)).toBe(false)
    const off = vi.fn()
    expect(await refreshRates(on({ autoRates: false }), update, off, now)).toBe(false)
    expect(off).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('can be forced before the day is over', async () => {
    const data = parseRates(body, 'EUR', now)
    const update = vi.fn().mockResolvedValue(undefined)
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => body })
    expect(await refreshRates(on({ autoRatesData: data }), update, fetcher, now, true)).toBe(true)
  })
})

describe('settings', () => {
  it('keeps the switch and the fetched rates, and drops a broken copy', () => {
    const data = parseRates(body, 'EUR', now)
    const kept = normalizeSettings({ autoRates: true, autoRatesData: data })
    expect(kept.autoRates).toBe(true)
    expect(kept.autoRatesData).toEqual(data)
    expect(normalizeSettings({ autoRates: 'yes', autoRatesData: { home: 'EUR' } })).toMatchObject({
      autoRates: false,
      autoRatesData: null,
    })
  })
})
