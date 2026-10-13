import type { FetchedRates } from '../settings'
import { isCurrency } from './money'

// The free service: the reference rates of the European Central Bank, with no key, no account and no cookie. The
// request carries the home currency and nothing else.
export const RATES_ORIGIN = 'https://api.frankfurter.dev/*'
export const RATES_URL = 'https://api.frankfurter.dev/v1/latest'
// Rates are published once a day: asking more often brings nothing.
export const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000

// The service answers "1 home = N other". The extension keeps "1 other = N home", as the user types them.
export function parseRates(body: unknown, home: string, now: Date): FetchedRates | null {
  if ('object' !== typeof body || null === body || !isCurrency(home)) {
    return null
  }
  const source = body as { base?: unknown; date?: unknown; rates?: unknown }
  if (source.base !== home || 'string' !== typeof source.date || 'object' !== typeof source.rates || !source.rates) {
    return null
  }
  const rates: Record<string, number> = {}
  for (const [code, perHome] of Object.entries(source.rates)) {
    if (isCurrency(code) && 'number' === typeof perHome && Number.isFinite(perHome) && 0 < perHome) {
      rates[code] = 1 / perHome
    }
  }
  return 0 === Object.keys(rates).length ? null : { home, date: source.date, fetchedAt: now.toISOString(), rates }
}

interface RateSettings {
  homeCurrency: string
  rates: Record<string, number>
  autoRates: boolean
  autoRatesData: FetchedRates | null
}

// The rates in use: those fetched (if the switch is on and they are for the home currency), then the rates typed by
// the user over them: what the user typed always wins.
export function effectiveRates(settings: RateSettings): Record<string, number> {
  const fetched =
    settings.autoRates && settings.autoRatesData?.home === settings.homeCurrency ? settings.autoRatesData.rates : {}
  return { ...fetched, ...settings.rates }
}

// True when a fetch is due: the switch is on, there is a home currency, and the rates are missing, are for another
// currency, or are a day old.
export function ratesAreDue(settings: RateSettings, now: Date): boolean {
  if (!settings.autoRates || '' === settings.homeCurrency) {
    return false
  }
  const data = settings.autoRatesData
  return data?.home !== settings.homeCurrency || RATES_MAX_AGE_MS <= now.getTime() - Date.parse(data.fetchedAt)
}
