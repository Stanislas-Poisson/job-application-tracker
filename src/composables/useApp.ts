import { inject } from 'vue'
import { CONTEXT_KEY } from '../app/context'
import { resolveLocale } from '../i18n'

export function useApp() {
  const context = inject(CONTEXT_KEY)
  if (!context) {
    throw new Error('The page was not started with mountApp().')
  }

  // Reading the locale in t() makes every text that uses it follow a change of language.
  const t = (path: string, replacements?: Record<string, string | number>) => {
    context.translator.setLocale(resolveLocale(context.locale.value, navigator.language))
    return context.translator.__(path, replacements)
  }

  return { t, locale: context.locale, persistence: context.persistence, translator: context.translator }
}
