import { inject } from 'vue'
import { CONTEXT_KEY } from '../app/context'
import { ensureLocale, pluralText, resolveLocale } from '../i18n'
import { defaultNamePath } from '../services/defaultNames'

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

  // The name of a column or source: translated while it still has the name it came with, as the user wrote it afterwards.
  const statusName = (status: { key: string; label: string }) => {
    const path = defaultNamePath('statuses', status)
    return path ? t(path) : status.label
  }
  const sourceName = (source: { key: string; label: string }) => {
    const path = defaultNamePath('sources', source)
    return path ? t(path) : source.label
  }

  return {
    t,
    statusName,
    sourceName,
    tn,
    settings: context.settings,
    updateSettings: context.updateSettings,
    persistence: context.persistence,
    translator: context.translator,
  }
}
