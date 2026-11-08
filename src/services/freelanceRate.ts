import type { PayProfile } from '../models'
import type { PayLine } from '../models/PayProfile'
import { type NetResult, computeNet } from './netPay'

// What the charges apply to: the whole turnover (a micro-enterprise: the costs cannot be deducted), or the profit, which is
// the turnover less the costs.
export type ChargesOn = 'turnover' | 'profit'

export interface FreelanceInput {
  currency: string
  // The days billed in the year, and the hours of a day.
  days: number
  hoursPerDay: number
  // The costs of the year (minor units): the tools, the accountant, the insurance, the office.
  costs: number
  chargesOn: ChargesOn
  // How the charges are computed: a pay profile (a rate or a scale, as for the net pay), or a flat rate in percent.
  profile: Pick<PayProfile, 'currency' | 'lines'> | null
  flatRate: number
  // The name of the line of a flat rate, in the language of the page.
  flatLabel?: string
}

export interface FreelanceResult {
  turnover: number
  costs: number
  // What the profile or the rate takes, line by line.
  charges: NetResult['lines']
  chargesTotal: number
  // What is left for the freelance.
  net: number
}

const linesOf = (input: FreelanceInput): PayLine[] =>
  null === input.profile
    ? [{ label: input.flatLabel ?? 'Charges', base: 'gross', kind: 'rate', rate: input.flatRate }]
    : input.profile.lines

/**
 * What a freelance keeps of a turnover of the year: the turnover, less the costs, less the charges. The charges are
 * computed by the profile (the same engine as the net pay of an employee) on the turnover, or on the profit.
 */
export function netFromTurnover(turnover: number, input: FreelanceInput): FreelanceResult {
  const base = 'turnover' === input.chargesOn ? turnover : Math.max(0, turnover - input.costs)
  const charged = computeNet(base, { currency: input.currency, lines: linesOf(input) })
  return {
    turnover,
    costs: input.costs,
    charges: charged.lines,
    chargesTotal: charged.deductions,
    net: turnover - input.costs - charged.deductions,
  }
}

/**
 * The smallest turnover of the year (minor units) that leaves the wanted net, found by search: the charges are not a formula
 * but a profile, possibly a scale, so the question is asked the other way round. Null when no turnover can leave it (the
 * profile takes everything above some level).
 */
export function turnoverForNet(wantedNet: number, input: FreelanceInput): number | null {
  const enough = (turnover: number) => netFromTurnover(turnover, input).net >= wantedNet
  let low = Math.max(0, wantedNet)
  let high = Math.max(1, low + input.costs)
  for (let step = 0; !enough(high); step++) {
    low = high
    high *= 2
    if (60 < step) {
      return null
    }
  }
  // The net never goes down as the turnover goes up (a charge is at most all of the extra), so the first enough is found by bisection.
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (enough(middle)) {
      high = middle
    } else {
      low = middle + 1
    }
  }
  return high
}

// The rates a turnover makes: per day billed, and per hour.
export function ratesOf(turnover: number, days: number, hoursPerDay: number): { daily: number; hourly: number } {
  const daily = 0 < days ? Math.ceil(turnover / days) : 0
  return { daily, hourly: 0 < days && 0 < hoursPerDay ? Math.ceil(turnover / (days * hoursPerDay)) : 0 }
}
