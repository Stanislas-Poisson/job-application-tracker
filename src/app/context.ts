import type { InjectionKey } from 'vue'
import type { createTranslator } from '../i18n'
import type { Persistence } from '../persistence'
import type { Settings } from '../settings'

export interface AppContext {
  translator: ReturnType<typeof createTranslator>
  persistence: Persistence
  // The settings of the user. Reactive: a change shows at once, and in the other pages too.
  settings: Settings
  // Changes some settings and saves them.
  updateSettings: (changes: Partial<Settings>) => Promise<void>
}

export const CONTEXT_KEY: InjectionKey<AppContext> = Symbol('app-context')
