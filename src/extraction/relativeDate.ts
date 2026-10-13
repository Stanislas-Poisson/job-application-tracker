import { todayIn } from '../utils/time'

const UNITS: Record<string, number> = {
  minute: 60_000,
  min: 60_000,
  heure: 3_600_000,
  hour: 3_600_000,
  h: 3_600_000,
  jour: 86_400_000,
  day: 86_400_000,
  j: 86_400_000,
  semaine: 7 * 86_400_000,
  week: 7 * 86_400_000,
  sem: 7 * 86_400_000,
  // A month and a year are not the same length twice: these are the usual approximations, enough for a day.
  mois: 30 * 86_400_000,
  month: 30 * 86_400_000,
  an: 365 * 86_400_000,
  année: 365 * 86_400_000,
  year: 365 * 86_400_000,
}

const UNIT = '(minute|min|heure|hour|h|jour|day|j|semaine|week|sem|mois|month|année|an|year)s?'
// "il y a 3 jours" (French) or "3 days ago" (English).
const BEFORE = new RegExp(`il y a\\s+(\\d+)\\s*${UNIT}\\b`, 'i')
const AFTER = new RegExp(`\\b(\\d+)\\s*${UNIT}\\s+ago\\b`, 'i')
const NOW = /(à l.instant|\bjust now\b|\bmoments? ago\b)/i

/**
 * The day a page means by "3 days ago", in the time zone of the user.
 *
 * A page that only says "3 days ago" does not know the exact day either: the result is the day that many days before
 * today, and a month or a year is counted as 30 or 365 days. It is meant as a starting point the user can correct.
 */
export function relativeDay(text: string, zone: string, now: Date = new Date()): string | null {
  if (NOW.test(text)) {
    return todayIn(zone, now)
  }
  const match = BEFORE.exec(text) ?? AFTER.exec(text)
  const unit = match?.[2] ? UNITS[match[2].toLowerCase()] : undefined
  if (!match?.[1] || undefined === unit) {
    return null
  }
  return todayIn(zone, new Date(now.getTime() - Number(match[1]) * unit))
}
