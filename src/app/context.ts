import type { InjectionKey } from 'vue'
import type { createTranslator } from '../i18n'
import type { Persistence } from '../persistence'
import type { Locale } from '../settings'

export interface AppContext {
  translator: ReturnType<typeof createTranslator>
  persistence: Persistence
  // The language the user chose. Changing it changes every text of the page.
  locale: { value: Locale }
}

export const CONTEXT_KEY: InjectionKey<AppContext> = Symbol('app-context')
