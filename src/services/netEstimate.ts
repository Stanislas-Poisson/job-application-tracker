import type { PayProfile } from '../models'
import { type Assumptions, type Salary, annualMinor } from '../utils/money'
import { type NetResult, computeNet } from './netPay'

// Why an offer has no estimate, as the key of the message to show.
export type NoEstimate = 'no-profile' | 'no-salary' | 'no-period' | 'is-net' | 'currency'

export interface NetEstimate {
  profile: string
  currency: string
  // The pay of the year at the low and the high end (the same when the offer gives one figure), and what is left of it.
  low: NetResult
  high: NetResult
  // The offer does not say whether its pay is gross or net: it was taken for gross.
  assumedGross: boolean
}

/**
 * The net pay an offer would give, by a pay profile. The salary of the offer is turned into a pay per year (a day is the
 * working days of the year, an hour the hours of a day: see the assumptions), then the profile is applied to each end.
 *
 * It is an estimate and is shown as one. It is not made when it would be a guess: no profile, no amount, no period, a pay
 * that is net already, or an offer whose currency is not the one of the profile (the profile holds amounts in its own).
 */
export function estimateNet(
  salary: Salary,
  profile: Pick<PayProfile, 'name' | 'currency' | 'lines'> | null,
  assumptions: Assumptions
): NetEstimate | NoEstimate {
  if (null === profile) {
    return 'no-profile'
  }
  if (null === salary.currency || (null === salary.min && null === salary.max)) {
    return 'no-salary'
  }
  if (null === salary.period) {
    return 'no-period'
  }
  if ('net' === salary.kind) {
    return 'is-net'
  }
  if (salary.currency !== profile.currency) {
    return 'currency'
  }
  const yearly = (value: number | null) =>
    null === value ? null : annualMinor(value, salary.period ?? 'year', assumptions)
  const min = yearly(salary.min)
  const max = yearly(salary.max)
  const low = min ?? (max as number)
  const high = max ?? low
  return {
    profile: profile.name,
    currency: profile.currency,
    low: computeNet(Math.min(low, high), profile),
    high: computeNet(Math.max(low, high), profile),
    assumedGross: null === salary.kind,
  }
}
