import type { Settings } from '../settings'
import { RATES_URL, parseRates, ratesAreDue } from '../utils/rates'

type Fetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

// Fetches the rates when they are due and keeps them. Returns true when new rates were kept. A service that cannot be
// reached, or that answers something else, changes nothing: the last rates stay.
export async function refreshRates(
  settings: Settings,
  update: (changes: Partial<Settings>) => Promise<void>,
  fetcher: Fetch = (url) => fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }),
  now = new Date(),
  force = false
): Promise<boolean> {
  if (force ? !settings.autoRates || '' === settings.homeCurrency : !ratesAreDue(settings, now)) {
    return false
  }
  try {
    const response = await fetcher(`${RATES_URL}?base=${encodeURIComponent(settings.homeCurrency)}`)
    if (!response.ok) {
      return false
    }
    const fetched = parseRates(await response.json(), settings.homeCurrency, now)
    if (!fetched) {
      return false
    }
    await update({ autoRatesData: fetched })
    return true
  } catch {
    return false
  }
}

// The address is an optional permission: asked when the switch goes on, given up when it goes off.
export async function requestRatesAccess(origin: string): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: [origin] })
  } catch {
    return false
  }
}

export async function dropRatesAccess(origin: string): Promise<void> {
  try {
    await browser.permissions.remove({ origins: [origin] })
  } catch {
    // Nothing to drop.
  }
}
