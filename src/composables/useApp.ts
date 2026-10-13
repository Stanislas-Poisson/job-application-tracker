import { inject } from 'vue'
import { CONTEXT_KEY } from '../app/context'
import { ensureLocale, pluralText, resolveLocale } from '../i18n'

export function useApp() {
  const context = inject(CONTEXT_KEY)
  if (!context) {
    throw new Error('The page was not started with mountApp().')
  }

  // Reading the locale in t() makes every text that uses it follow a change of language.
  const t = (path: string, replacements?: Record<string, string | number>) => {
    const locale = resolveLocale(context.settings.locale, navigator.language)
    ensureLocale(context.translator, locale)
    context.translator.setLocale(locale)
    return context.translator.__(path, replacements)
  }

  // A text that depends on a number: labels.usage.one, labels.usage.other… by the plural rules of the language.
  const tn = (path: string, count: number, replacements?: Record<string, string | number>) => {
    const locale = resolveLocale(context.settings.locale, navigator.language)
    ensureLocale(context.translator, locale)
    context.translator.setLocale(locale)
    return pluralText(context.translator, locale, path, count, replacements)
  }

  return {
    t,
    tn,
    settings: context.settings,
    updateSettings: context.updateSettings,
    persistence: context.persistence,
    translator: context.translator,
  }
}
