import { type Salary, type SalaryPeriod, currencyDigits } from '../utils/money'
import { findAmounts, kindFromWords, periodFromWords } from './salaryText'

// The currencies whose salaries are written in thousands a year or in thousands a month, where a plain figure can be told apart.
const MONTHLY_CURRENCIES = new Set(['EUR', 'GBP', 'CHF'])
// What a monthly pay looks like in those currencies (in major units): a month of work is worth between these, a year is worth
// much more. Between them and above, the figure is taken for a year.
const MONTH_RANGE = { low: 1000, high: 12_000 }
// Below this, nobody is paid by the year: it is an hourly rate.
const HOUR_BELOW = 100

const NEAR = 45

/**
 * What the text around the salary adds to it. The salary of a page is often written once in the header ("40 k€") and said again
 * in the text with its words ("à partir de 40 k€ brut annuel"): gross or net and the period are taken from the mention that has
 * the same amount, within a few words of it. A word that is not next to the amount is not used.
 */
export function completeFromText(salary: Salary, text: string | undefined): Salary {
  if (!text || null === salary.currency || (null !== salary.kind && null !== salary.period)) {
    return salary
  }
  const wanted = [salary.min, salary.max].filter((value): value is number => null !== value)
  const near = findAmounts(text).filter(
    (mention) => mention.currency === salary.currency && wanted.some((value) => value === mention.minor)
  )
  let { kind, period } = salary
  for (const mention of near) {
    // The same sentence only: a full stop, a semicolon or a new line ends what is said about the amount.
    const before =
      text
        .slice(Math.max(0, mention.index - NEAR), mention.index)
        .split(/[.;\n]/)
        .at(-1) ?? ''
    const after =
      text.slice(mention.index + mention.length, mention.index + mention.length + NEAR).split(/[.;\n]/)[0] ?? ''
    const around = `${before} ${after}`
    kind ??= kindFromWords(around)
    period ??= periodFromWords(around)
  }
  return { ...salary, kind, period }
}

/**
 * The period of a salary that does not say it. A year, unless the figure can only be something else: a month for a plain figure
 * that is a month of pay in euros, pounds or francs (3000 €), an hour for a very small one (15 €). 40 000 is a year; 40 000 $ is
 * a year too, since nothing tells otherwise. The user corrects what is wrong.
 */
export function guessPeriod(salary: Salary): SalaryPeriod | null {
  if (null !== salary.period || null === salary.currency) {
    return salary.period
  }
  const scale = 10 ** currencyDigits(salary.currency)
  const major = [salary.min, salary.max]
    .filter((value): value is number => null !== value)
    .map((value) => value / scale)
  if (0 === major.length) {
    return null
  }
  const high = Math.max(...major)
  const low = Math.min(...major)
  if (MONTHLY_CURRENCIES.has(salary.currency)) {
    if (high < HOUR_BELOW) {
      return 'hour'
    }
    if (MONTH_RANGE.low <= low && high <= MONTH_RANGE.high) {
      return 'month'
    }
  }
  return 'year'
}

export function completeSalary(salary: Salary, description: string | undefined): Salary {
  const completed = completeFromText(salary, description)
  return { ...completed, period: guessPeriod(completed) }
}
