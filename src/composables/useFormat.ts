import { computed } from 'vue'
import { resolveLocale } from '../i18n'
import type { JobOffer } from '../models'
import {
  type Conversion,
  type Salary,
  type SalaryLabels,
  comparableSalary,
  describeSalary,
  formatMoney,
} from '../utils/money'
import { effectiveRates } from '../utils/rates'
import { formatDate, formatInstant, resolveTimeZone } from '../utils/time'
import { useApp } from './useApp'

// The salary of an offer, as the money functions want it.
export const salaryOf = (
  offer: Pick<JobOffer, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod' | 'salaryKind'>
): Salary => ({
  min: offer.salaryMin ?? null,
  max: offer.salaryMax ?? null,
  currency: offer.salaryCurrency ?? null,
  period: offer.salaryPeriod ?? null,
  kind: offer.salaryKind ?? null,
})

// How a page writes the dates and the money: in the language, the time zone and the currencies of the settings, and
// again when they change.
export function useFormat() {
  const { settings, t } = useApp()
  const locale = computed(() => resolveLocale(settings.locale, navigator.language))
  const timeZone = computed(() => resolveTimeZone(settings.timeZone))

  const labels = (): SalaryLabels => ({
    from: (amount) => t('salary.from', { amount }),
    upTo: (amount) => t('salary.upTo', { amount }),
    per: {
      year: t('salary.per.year'),
      month: t('salary.per.month'),
      week: t('salary.per.week'),
      day: t('salary.per.day'),
      hour: t('salary.per.hour'),
    },
    kind: { gross: t('salary.kind.gross'), net: t('salary.kind.net') },
  })

  const conversion = (): Conversion => ({
    home: settings.homeCurrency,
    rates: effectiveRates(settings),
    assumptions: { workingDaysPerYear: settings.workingDaysPerYear, hoursPerDay: settings.hoursPerDay },
  })

  return {
    locale,
    timeZone,
    conversion,
    instant: (iso: string) => formatInstant(iso, { locale: locale.value, timeZone: timeZone.value }),
    date: (plain: string) => formatDate(plain, locale.value),
    // "EUR 45,000 - 55,000 / year (gross)", in the language and with the currency display of the settings.
    salary: (offer: Parameters<typeof salaryOf>[0]) =>
      describeSalary(salaryOf(offer), locale.value, settings.currencyDisplay, labels()),
    // The same salary as a middle amount per year in the home currency, when the rates allow it: "about 54,000 EUR / year".
    salaryInHome: (offer: Parameters<typeof salaryOf>[0]) => {
      const salary = salaryOf(offer)
      if ('' === settings.homeCurrency || salary.currency === settings.homeCurrency) {
        return ''
      }
      const amount = comparableSalary(salary, conversion())
      return null === amount
        ? ''
        : t('salary.inHome', {
            amount: formatMoney(amount, settings.homeCurrency, locale.value, settings.currencyDisplay),
          })
    },
  }
}
