// Time in the extension follows two rules:
//
// - A moment (when a message was sent, when a reminder is due) is stored in UTC, as an ISO string that ends with "Z".
//   It is shown in the time zone the user chose, and typed in that time zone.
// - A calendar date with no hour (the day an offer was published) is stored as a plain "YYYY-MM-DD" and never moves:
//   it is the same day for everybody, whatever the time zone.

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export const isInstant = (value: unknown): value is string => 'string' === typeof value && INSTANT.test(value)

export const isPlainDate = (value: unknown): value is string => {
  if ('string' !== typeof value || !PLAIN_DATE.test(value)) {
    return false
  }
  // 2026-02-30 looks like a date and is not one.
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function isValidTimeZone(zone: unknown): zone is string {
  if ('string' !== typeof zone || '' === zone) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// "auto" is the time zone of the browser. A zone that is not known (a list that changed) falls back on it.
export function resolveTimeZone(setting: string): string {
  return 'auto' !== setting && isValidTimeZone(setting) ? setting : browserTimeZone()
}

export function listTimeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const zones = supported ? supported('timeZone') : []
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsInZone(at: number, zone: string): Parts {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(zone, formatter)
  }
  const found: Record<string, number> = {}
  for (const part of formatter.formatToParts(at)) {
    if ('literal' !== part.type) {
      found[part.type] = Number(part.value)
    }
  }
  return {
    year: found.year ?? 0,
    month: found.month ?? 0,
    day: found.day ?? 0,
    hour: found.hour ?? 0,
    minute: found.minute ?? 0,
    second: found.second ?? 0,
  }
}

// The difference between a time zone and UTC at a moment, in minutes (+120 for Paris in summer).
export function offsetMinutes(zone: string, at: number | Date): number {
  const time = 'number' === typeof at ? at : at.getTime()
  const p = partsInZone(time, zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(time / 1000) * 1000) / 60000)
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

// The wall clock of a moment in a time zone, as "YYYY-MM-DDTHH:mm", which is what a datetime-local input holds.
export function utcToZonedInput(instant: string, zone: string): string {
  const p = partsInZone(new Date(instant).getTime(), zone)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * The moment (in UTC) of a wall clock typed in a time zone.
 *
 * Twice a year the wall clock is not simple. When the clocks go back, an hour happens twice: the first one is taken.
 * When they go forward, an hour does not exist: the time is moved forward by the length of the jump.
 */
export function zonedToUtc(local: string, zone: string): string {
  const match = LOCAL.exec(local)
  if (!match) {
    throw new Error(`Not a local date and time: ${local}`)
  }
  const [, year, month, day, hour, minute, second] = match
  const guess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0)
  )
  const wanted = `${year}-${month}-${day}T${hour}:${minute}`
  const dayMs = 86_400_000

  // The offsets of the day before and the day after cover a change of time that happens on that day.
  const offsets = [...new Set([offsetMinutes(zone, guess - dayMs), offsetMinutes(zone, guess + dayMs)])]
  const valid = offsets
    .map((offset) => guess - offset * 60_000)
    .filter((candidate) => utcToZonedInput(new Date(candidate).toISOString(), zone) === wanted)
    .sort((a, b) => a - b)

  const moment = valid[0] ?? guess - (offsets[0] ?? 0) * 60_000
  return new Date(moment).toISOString()
}

export interface FormatOptions {
  locale: string
  timeZone: string
}

// A moment, written in the language and the time zone of the user.
export function formatInstant(instant: string, { locale, timeZone }: FormatOptions): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(instant)
  )
}

// A plain date, written in the language of the user. It is read in UTC so that the day cannot move.
export function formatDate(plain: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${plain}T00:00:00Z`)
  )
}

// The time it is now somewhere else, with the name of the zone: "14:35 UTC+2".
export function formatTimeIn(zone: string, locale: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: zone,
  }).format(at)
}

// Today's date in a time zone, as a plain date.
export function todayIn(zone: string, at: Date = new Date()): string {
  return utcToZonedInput(at.toISOString(), zone).slice(0, 10)
}

const WITH_ZONE = /(Z|[+-]\d{2}(:?\d{2})?)$/i
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/

/**
 * The day an offer was published, as a plain date, from what a page says.
 *
 * - A date with no hour is that day, as it is.
 * - A date with an hour and a time zone (`Z`, `+02:00`) is a moment: it is the day it is in the time zone of the user.
 * - A date with an hour and no time zone is read in the time zone of the user, which is the default whenever the
 *   page does not say which one it uses. The day is the one written.
 *
 * Returns null when the text is not a date.
 */
export function postedDay(value: unknown, zone: string): string | null {
  if ('string' !== typeof value) {
    return null
  }
  const text = value.trim()
  if (isPlainDate(text)) {
    return text
  }
  const match = DATE_TIME.exec(text)
  if (!match?.[1] || !isPlainDate(match[1])) {
    return null
  }
  if (!WITH_ZONE.test(text)) {
    return match[1]
  }
  // The type guard above leaves no type for `text` on this path, hence the String().
  const moment = new Date(
    String(text)
      .replace(' ', 'T')
      .replace(/\s+(?=[+-]\d{2}:?\d{0,2}$)/, '')
      .replace(/([+-]\d{2})$/, '$1:00')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  )
  return Number.isNaN(moment.getTime()) ? null : todayIn(zone, moment)
}

// The wall clock of a day some days from now at a given hour, in a time zone: the default of a reminder.
export function inDaysAt(days: number, hour: number, zone: string, at: Date = new Date()): string {
  const [year = 0, month = 1, day = 1] = todayIn(zone, at).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:00`
}
