import { todayIn } from './time'

// How a date is written. "auto" is what the language does (13/10/2026 in French, 10/13/2026 in English, 13.10.2026 in German,
// 2026-10-13 in Swedish); the others are chosen by the user, whatever the language.
export const DATE_FORMATS = ['auto', 'dmy', 'mdy', 'ymd', 'medium', 'long', 'full', 'custom'] as const
export const TIME_FORMATS = ['auto', 'h24', 'h12'] as const
// Off: always the date. Both: the date and how long ago. Recent: how long ago for a moment of the last 30 days, else the date.
export const RELATIVE_MODES = ['off', 'both', 'recent'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]
export type TimeFormat = (typeof TIME_FORMATS)[number]
export type RelativeMode = (typeof RELATIVE_MODES)[number]

export const MAX_PATTERN = 40
export const DEFAULT_PATTERN = 'YYYY-MM-DD'
// A moment this close (in days) is "recent".
export const RECENT_DAYS = 30

export interface DateStyle {
  locale: string
  timeZone: string
  date: DateFormat
  time: TimeFormat
  // The pattern of the "custom" date format.
  custom: string
  relative: RelativeMode
}

export const isPattern = (value: unknown): value is string =>
  'string' === typeof value && 0 < value.trim().length && MAX_PATTERN >= value.length

// The tokens of a pattern, longest first. Text between square brackets is kept as it is; any other character is kept too.
const TOKENS = /\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D/g

interface Fields {
  year: number
  month: number
  day: number
  // 0 is Sunday.
  weekday: number
  hour: number
  minute: number
}

const FIELDS = new Map<string, Intl.DateTimeFormat>()

// The numbers of a moment in a time zone, always with Western digits, whatever the language.
function fieldsOf(at: Date, timeZone: string): Fields {
  let formatter = FIELDS.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
    FIELDS.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, Number(part.value)]))
  const year = parts.year ?? 1970
  const month = parts.month ?? 1
  const day = parts.day ?? 1
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  }
}

const two = (value: number): string => String(value).padStart(2, '0')

const named = (at: Date, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(at)

/**
 * A moment written by a pattern: YYYY YY (year), MMMM MMM MM M (month: name, short name, two digits, number), DD D (day),
 * dddd ddd (weekday: name, short name). `[text]` is kept as written. The names are in the language.
 * It only ever returns text: nothing of it is read as markup.
 */
export function formatPattern(pattern: string, at: Date, locale: string, timeZone: string): string {
  const fields = fieldsOf(at, timeZone)
  return pattern.replace(TOKENS, (token, literal: string | undefined) => {
    switch (token) {
      case 'YYYY':
        return String(fields.year)
      case 'YY':
        return two(fields.year % 100)
      case 'MMMM':
        return named(at, locale, timeZone, { month: 'long' })
      case 'MMM':
        return named(at, locale, timeZone, { month: 'short' })
      case 'MM':
        return two(fields.month)
      case 'M':
        return String(fields.month)
      case 'dddd':
        return named(at, locale, timeZone, { weekday: 'long' })
      case 'ddd':
        return named(at, locale, timeZone, { weekday: 'short' })
      case 'DD':
        return two(fields.day)
      case 'D':
        return String(fields.day)
      default:
        return literal ?? token
    }
  })
}

const PRESETS: Record<'dmy' | 'mdy' | 'ymd', string> = { dmy: 'DD/MM/YYYY', mdy: 'MM/DD/YYYY', ymd: 'YYYY-MM-DD' }

function dateText(at: Date, style: DateStyle, timeZone: string): string {
  const { locale, date, custom } = style
  switch (date) {
    case 'dmy':
    case 'mdy':
    case 'ymd':
      return formatPattern(PRESETS[date], at, locale, timeZone)
    case 'medium':
    case 'long':
    case 'full':
      return named(at, locale, timeZone, { dateStyle: date })
    case 'custom':
      return formatPattern(isPattern(custom) ? custom : DEFAULT_PATTERN, at, locale, timeZone)
    default:
      return named(at, locale, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  }
}

// The hour of a moment, as the settings write it.
export function formatTime(instant: string, style: DateStyle): string {
  return timeText(new Date(instant), style)
}

function timeText(at: Date, style: DateStyle): string {
  const { locale, timeZone, time } = style
  if ('h24' === time) {
    const fields = fieldsOf(at, timeZone)
    return `${two(fields.hour)}:${two(fields.minute)}`
  }
  return named(at, locale, timeZone, { timeStyle: 'short', ...('h12' === time ? { hour12: true } : {}) })
}

// A plain date (YYYY-MM-DD): a day, with no hour and no time zone. It is read at midnight UTC so that the day cannot move.
export function formatPlainDate(plain: string, style: DateStyle): string {
  return dateText(new Date(`${plain}T00:00:00Z`), style, 'UTC')
}

// A moment, as a date and an hour in the time zone of the user. Never relative.
export function formatAbsolute(instant: string, style: DateStyle): string {
  const at = new Date(instant)
  return `${dateText(at, style, style.timeZone)} ${timeText(at, style)}`
}

const DAY = 86_400_000

// The days from a moment to now in the calendar of the time zone: -1 is yesterday.
export function calendarDays(instant: string, now: Date, timeZone: string): number {
  const then = Date.parse(`${todayIn(timeZone, new Date(instant))}T00:00:00Z`)
  const today = Date.parse(`${todayIn(timeZone, now)}T00:00:00Z`)
  return Math.round((then - today) / DAY)
}

/**
 * How long ago (or how long from now) a moment is, in the language: "now", "5 minutes ago", "yesterday", "in 3 days",
 * "2 months ago". The words come from the browser, so every language has them.
 */
export function relativeText(instant: string, now: Date, locale: string, timeZone: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const ms = new Date(instant).getTime() - now.getTime()
  const seconds = Math.abs(ms) / 1000
  if (60 > seconds) {
    return rtf.format(0, 'second')
  }
  if (3600 > seconds) {
    return rtf.format(Math.round(ms / 60_000), 'minute')
  }
  if (86_400 > seconds) {
    return rtf.format(Math.round(ms / 3_600_000), 'hour')
  }
  const days = calendarDays(instant, now, timeZone)
  if (RECENT_DAYS >= Math.abs(days)) {
    return rtf.format(days, 'day')
  }
  return 365 > Math.abs(days) ? rtf.format(Math.round(days / 30), 'month') : rtf.format(Math.round(days / 365), 'year')
}

// A moment as the user asked: the date, how long ago, or both.
export function formatMoment(instant: string, style: DateStyle, now: Date = new Date()): string {
  const absolute = formatAbsolute(instant, style)
  if ('off' === style.relative) {
    return absolute
  }
  const relative = relativeText(instant, now, style.locale, style.timeZone)
  if ('both' === style.relative) {
    return `${absolute} · ${relative}`
  }
  return RECENT_DAYS >= Math.abs(calendarDays(instant, now, style.timeZone)) ? relative : absolute
}
