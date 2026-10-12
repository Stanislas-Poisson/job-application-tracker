import type { StorageAdapter } from './persistence/adapter'

export type Locale = 'auto' | 'en' | 'fr'

export interface Settings {
  locale: Locale
}

export const SETTINGS_KEY = 'jat:settings'
export const DEFAULT_SETTINGS: Settings = { locale: 'auto' }

export async function loadSettings(adapter: StorageAdapter): Promise<Settings> {
  const stored = await adapter.get([SETTINGS_KEY])
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) }
}

export async function saveSettings(adapter: StorageAdapter, settings: Settings) {
  await adapter.set({ [SETTINGS_KEY]: settings })
}
