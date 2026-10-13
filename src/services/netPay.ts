import { useRepo } from 'pinia-orm'
import { PayProfile } from '../models'
import type { PayLine } from '../models/PayProfile'
import { currencyDigits, fromMinor, isCurrency, toMinor } from '../utils/money'

// What a pay profile gives for a gross pay: the amount of each line, what is taken, what is left. Amounts in minor units.
export interface NetLine {
  label: string
  amount: number
}

export interface NetResult {
  currency: string
  gross: number
  lines: NetLine[]
  deductions: number
  net: number
  // What is taken, as a share of the gross (0 to 1).
  takenShare: number
}

// A progressive scale: each slice of the base up to `upTo` is taken at its own percentage.
export function progressive(base: number, brackets: { upTo: number | null; rate: number }[]): number {
  let taken = 0
  let from = 0
  for (const { upTo, rate } of brackets) {
    const to = upTo ?? Number.POSITIVE_INFINITY
    if (base <= from) {
      break
    }
    taken += ((Math.min(base, to) - from) * rate) / 100
    from = to
  }
  return taken
}

/**
 * The estimate of the net pay of a gross pay of a year, with a profile.
 *
 * The lines are taken in order. Each applies to the gross pay, or to what is left after the lines before it (a tax taken
 * after the contributions); to a share of it if the line says so; at a flat rate or on a progressive scale. Each amount is
 * rounded to the minor unit of the currency, and the net is the gross less the rounded amounts, so that what is shown adds
 * up. An estimate: the rules of a country change every year and depend on the person.
 */
export function computeNet(grossMinor: number, profile: Pick<PayProfile, 'currency' | 'lines'>): NetResult {
  const digits = currencyDigits(profile.currency)
  const round = (amount: number) => Math.round(toMinor(amount.toFixed(digits + 2), profile.currency))
  const gross = fromMinor(grossMinor, profile.currency)
  let left = gross
  const lines: NetLine[] = []
  for (const line of profile.lines) {
    const base = ('gross' === line.base ? gross : left) * ((line.share ?? 100) / 100)
    const amount = 'rate' === line.kind ? (base * (line.rate ?? 0)) / 100 : progressive(base, line.brackets ?? [])
    const rounded = round(amount)
    lines.push({ label: line.label, amount: rounded })
    left -= fromMinor(rounded, profile.currency)
  }
  const deductions = lines.reduce((total, line) => total + line.amount, 0)
  return {
    currency: profile.currency,
    gross: grossMinor,
    lines,
    deductions,
    net: grossMinor - deductions,
    takenShare: 0 === grossMinor ? 0 : deductions / grossMinor,
  }
}

// A profile that cannot be saved. The code is the key of the message to show.
export class PayProfileError extends Error {
  constructor(
    public readonly code: 'name' | 'currency' | 'label' | 'rate' | 'share' | 'brackets' | 'order' | 'base' | 'kind'
  ) {
    super(code)
  }
}

const isPercent = (value: unknown): value is number =>
  'number' === typeof value && Number.isFinite(value) && 0 <= value && 100 >= value

// The lines of a profile, checked and put in their canonical form. Throws a PayProfileError for the first fault.
export function normalizeLines(input: unknown): PayLine[] {
  const list = Array.isArray(input) ? (input as Record<string, unknown>[]) : []
  return list.map((raw): PayLine => {
    const label = 'string' === typeof raw.label ? raw.label.trim() : ''
    if ('' === label) {
      throw new PayProfileError('label')
    }
    if ('gross' !== raw.base && 'running' !== raw.base) {
      throw new PayProfileError('base')
    }
    const base = raw.base as 'gross' | 'running'
    if (undefined !== raw.share && !(isPercent(raw.share) && 0 < raw.share)) {
      throw new PayProfileError('share')
    }
    const common = { label, base, ...(undefined === raw.share ? {} : { share: raw.share as number }) }
    if ('rate' === raw.kind) {
      if (!isPercent(raw.rate)) {
        throw new PayProfileError('rate')
      }
      return { ...common, kind: 'rate', rate: raw.rate }
    }
    if ('brackets' === raw.kind) {
      const brackets = Array.isArray(raw.brackets) ? (raw.brackets as Record<string, unknown>[]) : []
      if (0 === brackets.length) {
        throw new PayProfileError('brackets')
      }
      let previous = 0
      const checked = brackets.map((bracket, index): { upTo: number | null; rate: number } => {
        const last = index === brackets.length - 1
        const rate = bracket.rate
        if (!isPercent(rate)) {
          throw new PayProfileError('rate')
        }
        const limit = bracket.upTo
        // Each limit is above the one before, and the last scale has no limit.
        if (last) {
          if (null !== limit) {
            throw new PayProfileError('order')
          }
          return { upTo: null, rate }
        }
        if ('number' !== typeof limit || !Number.isFinite(limit) || limit <= previous) {
          throw new PayProfileError('order')
        }
        previous = limit
        return { upTo: limit, rate }
      })
      return { ...common, kind: 'brackets', brackets: checked }
    }
    throw new PayProfileError('kind')
  })
}

export interface PayProfileInput {
  name: string
  country?: string | null
  status?: string | null
  currency: string
  lines: unknown
  notes?: string | null
}

const text = (value: string | null | undefined): string | null => {
  const clean = (value ?? '').trim()
  return '' === clean ? null : clean
}

// Saves a profile (a new one, or the one with `id`). Nothing is saved when it is refused.
export function savePayProfile(input: PayProfileInput, id?: string): PayProfile {
  const name = input.name.trim()
  if ('' === name) {
    throw new PayProfileError('name')
  }
  if (!isCurrency(input.currency)) {
    throw new PayProfileError('currency')
  }
  const fields = {
    name,
    country: text(input.country),
    status: text(input.status),
    currency: input.currency,
    lines: normalizeLines(input.lines),
    notes: text(input.notes),
  }
  return useRepo(PayProfile).save(undefined === id ? fields : { id, ...fields })
}

export function deletePayProfile(id: string) {
  useRepo(PayProfile).destroy(id)
}

// A copy of a profile, to start from it.
export function duplicatePayProfile(id: string, name: string): PayProfile | null {
  const found = useRepo(PayProfile).find(id)
  return found
    ? savePayProfile({
        name,
        country: found.country,
        status: found.status,
        currency: found.currency,
        notes: found.notes,
        lines: JSON.parse(JSON.stringify(found.lines)) as unknown,
      })
    : null
}

// A scale written as text, one slice per line: "11497 0", "29315 11", "∞ 45" (a limit per year, then the percentage; the last
// slice has no limit, written as ∞, inf, * or nothing). The comma or the semicolon can stand for the space.
export function parseBrackets(text: string): { upTo: number | null; rate: number }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\s;]+/).filter(Boolean)
      const rate = Number((parts.at(-1) ?? '').replace(',', '.'))
      const limit = 1 < parts.length ? (parts[0] ?? '') : ''
      const unlimited = '' === limit || /^(∞|inf|infinity|\*)$/i.test(limit)
      return { upTo: unlimited ? null : Number(limit.replace(',', '.')), rate }
    })
}

export function formatBrackets(brackets: { upTo: number | null; rate: number }[]): string {
  return brackets.map((bracket) => `${bracket.upTo ?? '∞'} ${bracket.rate}`).join('\n')
}
