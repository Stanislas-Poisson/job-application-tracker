import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '../../src/settings'
import {
  type DateStyle,
  formatAbsolute,
  formatMoment,
  formatPattern,
  formatPlainDate,
  formatTime,
  isPattern,
  relativeText,
} from '../../src/utils/dateFormat'

const style = (over: Partial<DateStyle> = {}): DateStyle => ({
  locale: 'fr',
  timeZone: 'Europe/Paris',
  date: 'auto',
  time: 'auto',
  custom: 'YYYY-MM-DD',
  relative: 'off',
  ...over,
})

// 13 October 2026, 14:30 in Paris.
const AT = '2026-10-13T12:30:00.000Z'

describe('a date follows the language, and the user can override it', () => {
  it('writes the numeric date the way each language does by default', () => {
    expect(formatPlainDate('2026-10-13', style({ locale: 'fr' }))).toBe('13/10/2026')
    expect(formatPlainDate('2026-10-13', style({ locale: 'en' }))).toBe('10/13/2026')
    expect(formatPlainDate('2026-10-13', style({ locale: 'de' }))).toBe('13.10.2026')
    expect(formatPlainDate('2026-10-13', style({ locale: 'sv' }))).toBe('2026-10-13')
  })

  it('lets the user choose year-month-day, whatever the language', () => {
    for (const locale of ['fr', 'en', 'de']) {
      expect(formatPlainDate('2026-10-13', style({ locale, date: 'ymd' }))).toBe('2026-10-13')
    }
    expect(formatPlainDate('2026-10-13', style({ date: 'dmy', locale: 'en' }))).toBe('13/10/2026')
    expect(formatPlainDate('2026-10-13', style({ date: 'mdy', locale: 'fr' }))).toBe('10/13/2026')
  })

  it('writes the long forms with the names of the language', () => {
    expect(formatPlainDate('2026-10-13', style({ date: 'long' }))).toBe('13 octobre 2026')
    expect(formatPlainDate('2026-10-13', style({ date: 'full' }))).toBe('mardi 13 octobre 2026')
    expect(formatPlainDate('2026-10-13', style({ date: 'full', locale: 'es' }))).toBe('martes, 13 de octubre de 2026')
  })

  it('does not move a plain date, in any time zone', () => {
    for (const timeZone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Paris']) {
      expect(formatPlainDate('2026-10-13', style({ timeZone, date: 'ymd' }))).toBe('2026-10-13')
    }
  })
})

describe('a pattern of the user', () => {
  const at = new Date(AT)

  it('knows the tokens', () => {
    expect(formatPattern('YYYY-MM-DD', at, 'fr', 'Europe/Paris')).toBe('2026-10-13')
    expect(formatPattern('D/M/YY', at, 'fr', 'Europe/Paris')).toBe('13/10/26')
    expect(formatPattern('dddd D MMMM YYYY', at, 'fr', 'Europe/Paris')).toBe('mardi 13 octobre 2026')
    expect(formatPattern('ddd D MMM', at, 'en', 'Europe/Paris')).toBe('Tue 13 Oct')
  })

  it('keeps a text in square brackets, and what is not a token', () => {
    expect(formatPattern('[le] D MMMM, [YYYY]', at, 'fr', 'Europe/Paris')).toBe('le 13 octobre, YYYY')
    expect(formatPattern('D · M · Z', at, 'fr', 'Europe/Paris')).toBe('13 · 10 · Z')
  })

  it('returns text, never markup that would be read as such', () => {
    expect(formatPattern('<b>D</b>', at, 'fr', 'Europe/Paris')).toBe('<b>13</b>')
  })

  it('uses the day of the time zone, which is not always the day in UTC', () => {
    expect(formatPattern('YYYY-MM-DD', new Date('2026-10-13T23:30:00Z'), 'fr', 'Europe/Paris')).toBe('2026-10-14')
    expect(formatPattern('YYYY-MM-DD', new Date('2026-10-13T23:30:00Z'), 'fr', 'America/New_York')).toBe('2026-10-13')
  })

  it('is valid when it has between 1 and 40 characters', () => {
    expect(isPattern('D')).toBe(true)
    expect(isPattern('')).toBe(false)
    expect(isPattern('   ')).toBe(false)
    expect(isPattern('x'.repeat(41))).toBe(false)
    expect(isPattern(3)).toBe(false)
  })
})

describe('the hour', () => {
  it('is 24 or 12 hours as chosen, and the language decides otherwise', () => {
    expect(formatTime(AT, style({ time: 'h24', locale: 'en' }))).toBe('14:30')
    expect(formatTime(AT, style({ time: 'h12', locale: 'fr' }))).toMatch(/^0?2:30/)
    expect(formatTime(AT, style({ time: 'auto', locale: 'fr' }))).toBe('14:30')
    expect(formatTime(AT, style({ time: 'auto', locale: 'en' }))).toMatch(/2:30.PM/)
  })

  it('goes with the date, in the time zone of the user', () => {
    expect(formatAbsolute(AT, style({ date: 'ymd', time: 'h24' }))).toBe('2026-10-13 14:30')
    expect(formatAbsolute(AT, style({ date: 'ymd', time: 'h24', timeZone: 'UTC' }))).toBe('2026-10-13 12:30')
  })
})

describe('how long ago', () => {
  const now = new Date('2026-10-13T12:30:00Z')
  const ago = (ms: number, locale = 'en') =>
    relativeText(new Date(now.getTime() - ms).toISOString(), now, locale, 'UTC')

  it('says now, minutes, hours, days, months and years, with the words of the language', () => {
    expect(ago(10_000)).toBe('now')
    expect(ago(5 * 60_000)).toBe('5 minutes ago')
    expect(ago(3 * 3_600_000)).toBe('3 hours ago')
    expect(ago(86_400_000)).toBe('yesterday')
    expect(ago(3 * 86_400_000)).toBe('3 days ago')
    expect(ago(60 * 86_400_000)).toBe('2 months ago')
    expect(ago(800 * 86_400_000)).toBe('2 years ago')
    expect(ago(3 * 3_600_000, 'fr')).toBe('il y a 3 heures')
    expect(ago(86_400_000, 'fr')).toBe('hier')
  })

  it('says hours under a day, then counts the days of the calendar of the time zone', () => {
    expect(relativeText('2026-10-12T23:30:00Z', new Date('2026-10-13T00:30:00Z'), 'en', 'UTC')).toBe('1 hour ago')
    // 30 hours ago is yesterday.
    expect(relativeText('2026-10-12T06:30:00Z', now, 'en', 'UTC')).toBe('yesterday')
    // The same moment is two days ago in a zone where the calendar is ahead.
    expect(relativeText('2026-10-10T22:30:00Z', new Date('2026-10-13T12:30:00Z'), 'en', 'Asia/Tokyo')).toBe(
      '2 days ago'
    )
  })

  it('looks ahead too', () => {
    expect(relativeText('2026-10-13T15:30:00Z', now, 'en', 'UTC')).toBe('in 3 hours')
    expect(relativeText('2026-10-14T12:30:00Z', now, 'en', 'UTC')).toBe('tomorrow')
  })

  it('is the date, the date and how long ago, or how long ago while it is recent', () => {
    const recent = '2026-10-10T12:30:00Z'
    const old = '2026-06-01T12:30:00Z'
    const base = style({ locale: 'en', timeZone: 'UTC', date: 'ymd', time: 'h24' })
    expect(formatMoment(recent, { ...base, relative: 'off' }, now)).toBe('2026-10-10 12:30')
    expect(formatMoment(recent, { ...base, relative: 'both' }, now)).toBe('2026-10-10 12:30 · 3 days ago')
    expect(formatMoment(recent, { ...base, relative: 'recent' }, now)).toBe('3 days ago')
    expect(formatMoment(old, { ...base, relative: 'recent' }, now)).toBe('2026-06-01 12:30')
  })
})

describe('the settings', () => {
  it('start by following the language, with no relative dates', () => {
    const settings = normalizeSettings({})
    expect([settings.dateFormat, settings.timeFormat, settings.relativeDates, settings.dateCustom]).toEqual([
      'auto',
      'auto',
      'off',
      'YYYY-MM-DD',
    ])
  })

  it('keep a valid choice and drop the rest', () => {
    const kept = normalizeSettings({ dateFormat: 'ymd', timeFormat: 'h24', relativeDates: 'both', dateCustom: 'D/M' })
    expect([kept.dateFormat, kept.timeFormat, kept.relativeDates, kept.dateCustom]).toEqual([
      'ymd',
      'h24',
      'both',
      'D/M',
    ])
    const bad = normalizeSettings({ dateFormat: 'x', timeFormat: 12, relativeDates: null, dateCustom: 'x'.repeat(100) })
    expect([bad.dateFormat, bad.timeFormat, bad.relativeDates, bad.dateCustom]).toEqual([
      'auto',
      'auto',
      'off',
      'YYYY-MM-DD',
    ])
  })
})
