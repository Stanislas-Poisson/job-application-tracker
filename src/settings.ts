import type { StorageAdapter } from './persistence/adapter'
import { isValidTimeZone } from './utils/time'

export const LOCALES = ['auto', 'en', 'fr'] as const
export const THEMES = ['auto', 'light', 'dark'] as const
export const ACCENTS = ['slate', 'blue', 'teal', 'green', 'purple', 'pink', 'orange'] as const
// Colour-blind modes change the colours and give each column a shape; high contrast thickens the lines and the text.
export const VISIONS = ['standard', 'red-green', 'blue-yellow', 'high-contrast'] as const

export type Locale = (typeof LOCALES)[number]
export type ThemeMode = (typeof THEMES)[number]
export type Accent = (typeof ACCENTS)[number]
export type Vision = (typeof VISIONS)[number]

export interface Settings {
  locale: Locale
  theme: ThemeMode
  accent: Accent
  vision: Vision
  // "auto" is the time zone of the browser, or a name of the IANA database (Europe/Paris).
  timeZone: string
}

export const SETTINGS_KEY = 'jat:settings'
export const DEFAULT_SETTINGS: Settings = {
  locale: 'auto',
  theme: 'auto',
  accent: 'slate',
  vision: 'standard',
  timeZone: 'auto',
}

const oneOf = (values: readonly unknown[]) => (value: unknown) => values.includes(value)

// What a setting may hold. A stored value that does not pass is replaced by the default.
const VALID: { [K in keyof Settings]: (value: unknown) => boolean } = {
  locale: oneOf(LOCALES),
  theme: oneOf(THEMES),
  accent: oneOf(ACCENTS),
  vision: oneOf(VISIONS),
  timeZone: (value) => 'auto' === value || isValidTimeZone(value),
}

// What was stored, with the defaults for what is missing, and the defaults again for a value that is not allowed
// (a setting removed in a later version, a file edited by hand).
export function normalizeSettings(stored: unknown): Settings {
  const source = 'object' === typeof stored && null !== stored ? (stored as Record<string, unknown>) : {}
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (VALID[key](source[key])) {
      ;(settings[key] as unknown) = source[key]
    }
  }
  return settings
}

export async function loadSettings(adapter: StorageAdapter): Promise<Settings> {
  const stored = await adapter.get([SETTINGS_KEY])
  return normalizeSettings(stored[SETTINGS_KEY])
}

export async function saveSettings(adapter: StorageAdapter, settings: Settings) {
  await adapter.set({ [SETTINGS_KEY]: settings })
}
