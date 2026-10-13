import { shallowRef } from 'vue'
import { MAX_LANGUAGES, type StoredLanguage, normalizeStoredLanguages } from './customLanguage'
import type { StorageAdapter } from './persistence/adapter'
import { SETTINGS_KEY, normalizeSettings } from './settings'

// The languages the user added from a file. They are kept on this machine, apart from the data (they are not in the backups).
export const LANGUAGES_KEY = 'jat:languages'

// The ones in use, read by every page: a change here is seen by what reads it.
export const installed = shallowRef<StoredLanguage[]>([])

export const customLanguage = (code: string): StoredLanguage | undefined =>
  installed.value.find((language) => language.code === code)

export async function loadCustomLanguages(adapter: StorageAdapter): Promise<StoredLanguage[]> {
  const stored = await adapter.get([LANGUAGES_KEY, SETTINGS_KEY])
  const developer = normalizeSettings(stored[SETTINGS_KEY]).developerMode
  installed.value = normalizeStoredLanguages(stored[LANGUAGES_KEY], { developer })
  return installed.value
}

// Keeps a language, or replaces the one with the same code. Refuses when there are already as many as can be kept.
export async function addCustomLanguage(adapter: StorageAdapter, language: StoredLanguage): Promise<boolean> {
  const others = installed.value.filter((candidate) => candidate.code !== language.code)
  if (others.length >= MAX_LANGUAGES) {
    return false
  }
  installed.value = [...others, language]
  await adapter.set({ [LANGUAGES_KEY]: JSON.parse(JSON.stringify(installed.value)) as StoredLanguage[] })
  return true
}

export async function removeCustomLanguage(adapter: StorageAdapter, code: string) {
  installed.value = installed.value.filter((language) => language.code !== code)
  await adapter.set({ [LANGUAGES_KEY]: JSON.parse(JSON.stringify(installed.value)) as StoredLanguage[] })
}
