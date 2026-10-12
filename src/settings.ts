import type { StorageAdapter } from './persistence/adapter'

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
}

export const SETTINGS_KEY = 'jat:settings'
export const DEFAULT_SETTINGS: Settings = { locale: 'auto', theme: 'auto', accent: 'slate', vision: 'standard' }

const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] } = {
  locale: LOCALES,
  theme: THEMES,
  accent: ACCENTS,
  vision: VISIONS,
}

// What was stored, with the defaults for what is missing, and the defaults again for a value that is not allowed
// (a setting removed in a later version, a file edited by hand).
export function normalizeSettings(stored: unknown): Settings {
  const source = 'object' === typeof stored && null !== stored ? (stored as Record<string, unknown>) : {}
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = source[key]
    if ((ALLOWED[key] as readonly unknown[]).includes(value)) {
      ;(settings[key] as unknown) = value
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
