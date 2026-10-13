import { CODE } from './customLanguage'
import { type CustomTheme, normalizeThemes } from './customTheme'
import type { StorageAdapter } from './persistence/adapter'
import { type AddressParts, emptyAddress, normalizeAddress } from './services/address'
import { type PassphraseCheck, normalizeCheck } from './services/encryption'
import { isCountry, normalizeEmail } from './utils/contact'
import {
  DATE_FORMATS,
  DEFAULT_PATTERN,
  type DateFormat,
  RELATIVE_MODES,
  type RelativeMode,
  TIME_FORMATS,
  type TimeFormat,
  isPattern,
} from './utils/dateFormat'
import { CURRENCY_DISPLAYS, type CurrencyDisplay, DEFAULT_ASSUMPTIONS, isCurrency } from './utils/money'
import { isInstant, isValidTimeZone } from './utils/time'

export const THEMES = ['auto', 'light', 'dark'] as const
export const ACCENTS = ['slate', 'blue', 'teal', 'green', 'purple', 'pink', 'orange'] as const
// Colour-blind modes change the colours and give each column a shape; high contrast thickens the lines and the text.
export const VISIONS = ['standard', 'red-green', 'blue-yellow', 'high-contrast'] as const

// "auto", a language of the extension, or the code of a language the user added from a file (checked when it is used).
export type Locale = string
const LOCALE_CODE = CODE
export type ThemeMode = (typeof THEMES)[number]
export type Accent = (typeof ACCENTS)[number]
export type Vision = (typeof VISIONS)[number]

// Rates fetched for a home currency: one unit of a currency in that home currency.
export interface FetchedRates {
  home: string
  // The day the rates are for (YYYY-MM-DD), as the service gives it.
  date: string
  // When they were fetched (UTC).
  fetchedAt: string
  rates: Record<string, number>
}

export const FONT_FAMILIES = ['system', 'serif', 'mono', 'custom'] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]
export const TEXT_SPACINGS = ['default', 'wide', 'wcag', 'widest'] as const
export type TextSpacing = (typeof TEXT_SPACINGS)[number]
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]
export const MOTIONS = ['auto', 'reduce'] as const
export type Motion = (typeof MOTIONS)[number]
export const TEXT_SCALES = [80, 90, 100, 110, 125, 150, 175, 200] as const

export interface Settings {
  locale: Locale
  theme: ThemeMode
  accent: Accent
  vision: Vision
  // The themes of the user's own, and the one in use ("" for none).
  customThemes: CustomTheme[]
  customThemeId: string
  // How the text looks: the font, its size in percent of the usual one, the spacing (see appearance.ts), the density of the
  // interface and whether the movement is reduced.
  fontFamily: FontFamily
  // A font installed on the machine, used when fontFamily is "custom".
  fontCustom: string
  textScale: number
  textSpacing: TextSpacing
  density: Density
  motion: Motion
  // "auto" is the time zone of the browser, or a name of the IANA database (Europe/Paris).
  timeZone: string
  // Lets a language file take the place of a language of the extension, to try a translation before sending it.
  developerMode: boolean
  // How dates are written: "auto" follows the language. The pattern is the one of the "custom" format. Relative dates say how long ago.
  dateFormat: DateFormat
  timeFormat: TimeFormat
  dateCustom: string
  relativeDates: RelativeMode
  // The country a phone number typed without a country code is read in: "auto" is the one of the language of the browser.
  defaultCountry: string
  // The currency the salaries are compared in (an ISO 4217 code), or '' for none.
  homeCurrency: string
  currencyDisplay: CurrencyDisplay
  // What one unit of a currency is worth in the home currency. The user types them: nothing is fetched.
  rates: Record<string, number>
  // Off by default. On: the rates the user did not type are fetched once a day from a free service.
  autoRates: boolean
  // What was fetched last: the rates, in the home currency they were fetched for.
  autoRatesData: FetchedRates | null
  // The email addresses of the user, in lower case: they tell a message that was sent from one that was received.
  ownEmails: string[]
  workingDaysPerYear: number
  hoursPerDay: number
  // Remind the user to back up when the last backup is older than this many days. 0 turns the reminder off.
  // How many days after applying a follow-up reminder is suggested.
  followUpDays: number
  // The pay profile that estimates the net pay of the offers, or '' for none (an id of the profiles).
  payProfileId: string
  // The address a route starts from (home), and the map service the links open. Nothing is sent by the extension: a link is
  // built, and the browser opens it when the user clicks.
  // The address a route starts from, in fields; its coordinates, if the user gives them, let a route be made by services that need them.
  home: AddressParts
  mapProvider: 'google' | 'osm' | 'apple' | 'custom'
  // The link of a map service of their own, with {from} and {to} (the addresses) and {query} (a place), for 'custom'.
  mapCustomTemplate: string
  travelMode: 'car' | 'transit' | 'bike' | 'walk'
  // Notify when a reminder comes due. Off by default: it needs the permission of the browser, asked when this is turned on.
  notifyReminders: boolean
  // Keep the notification on screen until the user closes it (Chrome and Edge; Firefox does not know the option).
  notifyPersistent: boolean
  backupReminderDays: number
  // When the data was last backed up to a file (UTC), or null when it never was.
  lastBackupAt: string | null
  // Protect the backups with a passphrase. The passphrase itself is never kept: only a check that tells whether a passphrase
  // typed later is the same one (an encrypted known text), so that a typing mistake does not make a backup nobody can open.
  backupProtect: boolean
  backupPassphraseCheck: PassphraseCheck | null
}

export const SETTINGS_KEY = 'jat:settings'
export const DEFAULT_SETTINGS: Settings = {
  locale: 'auto',
  theme: 'auto',
  accent: 'slate',
  vision: 'standard',
  customThemes: [],
  customThemeId: '',
  fontFamily: 'system',
  fontCustom: '',
  textScale: 100,
  textSpacing: 'default',
  density: 'comfortable',
  motion: 'auto',
  timeZone: 'auto',
  developerMode: false,
  dateFormat: 'auto',
  timeFormat: 'auto',
  dateCustom: DEFAULT_PATTERN,
  relativeDates: 'off',
  defaultCountry: 'auto',
  homeCurrency: '',
  currencyDisplay: 'symbol',
  rates: {},
  autoRates: false,
  autoRatesData: null,
  ownEmails: [],
  followUpDays: 7,
  payProfileId: '',
  home: emptyAddress(),
  mapProvider: 'google',
  mapCustomTemplate: '',
  travelMode: 'car',
  notifyReminders: false,
  notifyPersistent: true,
  backupReminderDays: 30,
  lastBackupAt: null,
  backupProtect: false,
  backupPassphraseCheck: null,
  ...DEFAULT_ASSUMPTIONS,
}

const oneOf = (values: readonly unknown[]) => (value: unknown) => values.includes(value)
const inRange = (min: number, max: number) => (value: unknown) =>
  'number' === typeof value && Number.isFinite(value) && min <= value && value <= max

// What a setting may hold. A stored value that does not pass is replaced by the default.
const VALID: {
  [
    K in Exclude<
      keyof Settings,
      'rates' | 'ownEmails' | 'autoRatesData' | 'lastBackupAt' | 'backupPassphraseCheck' | 'home' | 'customThemes'
    >
  ]: (value: unknown) => boolean
} = {
  locale: (value) => 'auto' === value || ('string' === typeof value && LOCALE_CODE.test(value)),
  theme: oneOf(THEMES),
  accent: oneOf(ACCENTS),
  vision: oneOf(VISIONS),
  customThemeId: (value) => 'string' === typeof value && 64 >= value.length,
  fontFamily: oneOf(FONT_FAMILIES),
  // The name of a font goes into a style: letters, digits, spaces, dots, dashes and underscores only.
  fontCustom: (value) => 'string' === typeof value && 100 >= value.length && /^[\p{L}\p{N} ._-]*$/u.test(value),
  textScale: (value) => (TEXT_SCALES as readonly unknown[]).includes(value),
  textSpacing: oneOf(TEXT_SPACINGS),
  density: oneOf(DENSITIES),
  motion: oneOf(MOTIONS),
  timeZone: (value) => 'auto' === value || isValidTimeZone(value),
  developerMode: (value) => 'boolean' === typeof value,
  dateFormat: oneOf(DATE_FORMATS),
  timeFormat: oneOf(TIME_FORMATS),
  dateCustom: isPattern,
  relativeDates: oneOf(RELATIVE_MODES),
  defaultCountry: (value) => 'auto' === value || isCountry(value),
  homeCurrency: (value) => '' === value || isCurrency(value),
  currencyDisplay: oneOf(CURRENCY_DISPLAYS),
  autoRates: (value) => 'boolean' === typeof value,
  workingDaysPerYear: inRange(1, 366),
  hoursPerDay: inRange(1, 24),
  backupProtect: (value) => 'boolean' === typeof value,
  followUpDays: (value) => Number.isInteger(value) && inRange(1, 60)(value),
  payProfileId: (value) => 'string' === typeof value,
  mapProvider: oneOf(['google', 'osm', 'apple', 'custom']),
  mapCustomTemplate: (value) => 'string' === typeof value && 500 >= value.length,
  travelMode: oneOf(['car', 'transit', 'bike', 'walk']),
  notifyReminders: (value) => 'boolean' === typeof value,
  notifyPersistent: (value) => 'boolean' === typeof value,
  backupReminderDays: (value) => Number.isInteger(value) && inRange(0, 365)(value),
}

// The rates are a list: an entry that is not a currency, or not a positive number, is dropped and the others stay.
export function normalizeRates(value: unknown): Record<string, number> {
  const rates: Record<string, number> = {}
  if ('object' === typeof value && null !== value) {
    for (const [code, rate] of Object.entries(value)) {
      if (isCurrency(code) && 'number' === typeof rate && Number.isFinite(rate) && 0 < rate) {
        rates[code] = rate
      }
    }
  }
  return rates
}

function normalizeFetched(value: unknown): FetchedRates | null {
  if ('object' !== typeof value || null === value) {
    return null
  }
  const source = value as Record<string, unknown>
  const rates = normalizeRates(source.rates)
  if (
    !isCurrency(source.home) ||
    'string' !== typeof source.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(source.date) ||
    'string' !== typeof source.fetchedAt ||
    Number.isNaN(Date.parse(source.fetchedAt)) ||
    0 === Object.keys(rates).length
  ) {
    return null
  }
  return { home: source.home, date: source.date, fetchedAt: source.fetchedAt, rates }
}

// The addresses are a list: one that is not an address is dropped, a repeated one is kept once, and there are not more
// than twenty.
export function normalizeEmails(value: unknown): string[] {
  const emails: string[] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = 'string' === typeof item ? normalizeEmail(item) : null
      if (email && !emails.includes(email) && 20 > emails.length) {
        emails.push(email)
      }
    }
  }
  return emails
}

// What was stored, with the defaults for what is missing, and the defaults again for a value that is not allowed
// (a setting removed in a later version, a file edited by hand).
export function normalizeSettings(stored: unknown): Settings {
  const source = 'object' === typeof stored && null !== stored ? (stored as Record<string, unknown>) : {}
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    rates: normalizeRates(source.rates),
    customThemes: normalizeThemes(source.customThemes),
    autoRatesData: normalizeFetched(source.autoRatesData),
    ownEmails: normalizeEmails(source.ownEmails),
    lastBackupAt: isInstant(source.lastBackupAt) ? source.lastBackupAt : null,
    backupPassphraseCheck: normalizeCheck(source.backupPassphraseCheck),
    // The address a route starts from. Before it was in fields, it was a line of text: that line is the first line.
    home: normalizeAddress(
      'object' === typeof source.home && null !== source.home
        ? source.home
        : { line1: 'string' === typeof source.homeAddress ? source.homeAddress : '' }
    ),
  }
  for (const key of Object.keys(VALID) as (keyof typeof VALID)[]) {
    if (VALID[key](source[key])) {
      ;(settings[key] as unknown) = source[key]
    }
  }
  if (!settings.customThemes.some((theme) => theme.id === settings.customThemeId)) {
    settings.customThemeId = ''
  }
  return settings
}

export async function loadSettings(adapter: StorageAdapter): Promise<Settings> {
  const stored = await adapter.get([SETTINGS_KEY])
  return normalizeSettings(stored[SETTINGS_KEY])
}

// The settings are plain data when they are written: a page holds them as a reactive object, with proxies inside (the
// rates), and a browser cannot store a proxy.
export async function saveSettings(adapter: StorageAdapter, settings: Settings) {
  await adapter.set({ [SETTINGS_KEY]: JSON.parse(JSON.stringify(settings)) as Settings })
}

let writing: Promise<unknown> = Promise.resolve()
// The changes that wait for their turn to be written. Those made while they wait join them: a burst of changes (a field typed
// letter by letter) makes one write, not one for each.
let waiting: { changes: Partial<Settings>; done: Promise<Settings> } | null = null

/**
 * Changes some settings in the storage without touching the others. The page that asks may hold a copy that is behind (another
 * page changed a setting it has not read yet): writing the whole copy would put the old value back. So the storage is read at
 * the moment of the change, the changed settings are put into what it holds, and the result is written. Changes made by a page
 * wait for one another, so that two of them do not read the same state, and those that wait are written together.
 */
export function changeSettings(adapter: StorageAdapter, changes: Partial<Settings>): Promise<Settings> {
  if (waiting) {
    Object.assign(waiting.changes, changes)
    return waiting.done
  }
  const batch = { changes: { ...changes }, done: Promise.resolve({} as Settings) }
  waiting = batch
  batch.done = writing.then(async () => {
    // From here a new change makes a batch of its own.
    waiting = null
    const next = normalizeSettings({ ...(await loadSettings(adapter)), ...batch.changes })
    await saveSettings(adapter, next)
    return next
  })
  writing = batch.done.catch(() => undefined)
  return batch.done
}

/**
 * Keeps the settings of a page (an object it shows and edits) and the storage the same, in both ways.
 *
 * `update` changes some settings at once in the page and writes them. While a write of this page is under way the storage
 * tells the page about it (and about the older writes before it): reading that back would put an old value over what was just
 * typed. So the page reads the storage only when none of its own writes is under way, and then takes in what other pages did.
 */
export function syncSettings(adapter: StorageAdapter, settings: Settings) {
  let inFlight = 0
  const refresh = async () => {
    const fresh = await loadSettings(adapter)
    // A change made while the storage was being read stands: it is in the next write.
    if (0 === inFlight) {
      Object.assign(settings, fresh)
    }
  }
  const stop = adapter.onChanged((keys) => {
    if (keys.includes(SETTINGS_KEY) && 0 === inFlight) {
      void refresh()
    }
  })
  const update = async (changes: Partial<Settings>) => {
    Object.assign(settings, changes)
    inFlight++
    try {
      await changeSettings(adapter, changes)
    } finally {
      inFlight--
      if (0 === inFlight) {
        await refresh()
      }
    }
  }
  return { update, refresh, stop }
}
