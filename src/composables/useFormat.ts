import { computed } from 'vue'
import { resolveLocale } from '../i18n'
import { formatDate, formatInstant, resolveTimeZone } from '../utils/time'
import { useApp } from './useApp'

// How a page writes the dates: in the language and in the time zone of the settings, and again when they change.
export function useFormat() {
  const { settings } = useApp()
  const locale = computed(() => resolveLocale(settings.locale, navigator.language))
  const timeZone = computed(() => resolveTimeZone(settings.timeZone))

  return {
    locale,
    timeZone,
    instant: (iso: string) => formatInstant(iso, { locale: locale.value, timeZone: timeZone.value }),
    date: (plain: string) => formatDate(plain, locale.value),
  }
}
