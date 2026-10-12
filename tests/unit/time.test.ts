import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatInstant,
  formatTimeIn,
  inDaysAt,
  isInstant,
  isPlainDate,
  isValidTimeZone,
  listTimeZones,
  offsetMinutes,
  resolveTimeZone,
  todayIn,
  utcToZonedInput,
  zonedToUtc,
} from '../../src/utils/time'

describe('what is a moment and what is a date', () => {
  it('knows a moment in UTC', () => {
    expect(isInstant('2026-10-12T14:30:00.000Z')).toBe(true)
    expect(isInstant('2026-10-12T14:30Z')).toBe(true)
    expect(isInstant('2026-10-12T14:30:00+02:00')).toBe(false)
    expect(isInstant('2026-10-12')).toBe(false)
    expect(isInstant(12)).toBe(false)
  })

  it('knows a plain date, and refuses one that does not exist', () => {
    expect(isPlainDate('2026-10-12')).toBe(true)
    expect(isPlainDate('2026-02-30')).toBe(false)
    expect(isPlainDate('2026-13-01')).toBe(false)
    expect(isPlainDate('2026-10-12T00:00:00Z')).toBe(false)
  })

  it('knows a time zone', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('falls back on the zone of the browser for "auto" and for an unknown zone', () => {
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(isValidTimeZone(resolveTimeZone('auto'))).toBe(true)
    expect(resolveTimeZone('auto')).toBe(resolveTimeZone('Mars/Olympus'))
  })

  it('lists the zones of the browser, with UTC', () => {
    expect(listTimeZones()).toContain('UTC')
    expect(listTimeZones()).toContain('Europe/Paris')
  })
})

describe('offsets', () => {
  it('follows the summer time', () => {
    expect(offsetMinutes('Europe/Paris', Date.UTC(2026, 0, 15, 12))).toBe(60)
    expect(offsetMinutes('Europe/Paris', Date.UTC(2026, 6, 15, 12))).toBe(120)
    expect(offsetMinutes('America/New_York', Date.UTC(2026, 6, 15, 12))).toBe(-240)
    expect(offsetMinutes('Asia/Kolkata', Date.UTC(2026, 6, 15, 12))).toBe(330)
    expect(offsetMinutes('Pacific/Kiritimati', Date.UTC(2026, 6, 15, 12))).toBe(840)
    expect(offsetMinutes('UTC', Date.UTC(2026, 6, 15, 12))).toBe(0)
  })
})

describe('typing a time in a time zone', () => {
  it.each([
    ['Europe/Paris', '2026-01-15T09:00', '2026-01-15T08:00:00.000Z'],
    ['Europe/Paris', '2026-07-15T09:00', '2026-07-15T07:00:00.000Z'],
    ['America/New_York', '2026-07-15T09:00', '2026-07-15T13:00:00.000Z'],
    ['Asia/Kolkata', '2026-07-15T09:00', '2026-07-15T03:30:00.000Z'],
    ['Pacific/Kiritimati', '2026-12-24T09:00', '2026-12-23T19:00:00.000Z'],
    ['Pacific/Pago_Pago', '2026-12-24T09:00', '2026-12-24T20:00:00.000Z'],
    ['UTC', '2026-12-24T09:00', '2026-12-24T09:00:00.000Z'],
  ])('%s, %s is %s in UTC', (zone, local, utc) => {
    expect(zonedToUtc(local, zone)).toBe(utc)
  })

  it('takes the first of the two times when the clocks go back', () => {
    // Paris, 25 October 2026: 02:30 happens at 00:30 UTC (summer time) and again at 01:30 UTC.
    expect(zonedToUtc('2026-10-25T02:30', 'Europe/Paris')).toBe('2026-10-25T00:30:00.000Z')
  })

  it('moves a time that does not exist forward when the clocks go forward', () => {
    // Paris, 29 March 2026: 02:30 does not exist, the clocks jump from 02:00 to 03:00.
    expect(zonedToUtc('2026-03-29T02:30', 'Europe/Paris')).toBe('2026-03-29T01:30:00.000Z')
    expect(utcToZonedInput('2026-03-29T01:30:00.000Z', 'Europe/Paris')).toBe('2026-03-29T03:30')
  })

  it('comes back to what was typed, in several zones through a year', () => {
    const zones = [
      'Europe/Paris',
      'America/New_York',
      'Asia/Kolkata',
      'Australia/Lord_Howe',
      'Pacific/Kiritimati',
      'UTC',
    ]
    for (const zone of zones) {
      for (let month = 1; 12 >= month; month += 1) {
        const local = `2026-${String(month).padStart(2, '0')}-10T10:15`
        expect(utcToZonedInput(zonedToUtc(local, zone), zone)).toBe(local)
      }
    }
  })

  it('refuses what is not a local date and time', () => {
    expect(() => zonedToUtc('tomorrow', 'UTC')).toThrow(/Not a local date/)
  })
})

describe('showing a moment', () => {
  it('shows the same moment on another day in another time zone', () => {
    const moment = '2026-12-23T19:00:00.000Z'

    expect(formatInstant(moment, { locale: 'en', timeZone: 'Pacific/Kiritimati' })).toContain('24')
    expect(formatInstant(moment, { locale: 'en', timeZone: 'America/Los_Angeles' })).toContain('23')
  })

  it('writes in the language asked', () => {
    expect(formatInstant('2026-12-23T19:00:00.000Z', { locale: 'fr', timeZone: 'UTC' })).toContain('déc')
    expect(formatInstant('2026-12-23T19:00:00.000Z', { locale: 'en', timeZone: 'UTC' })).toContain('Dec')
  })

  it('never moves a plain date, whatever the zone of the machine', () => {
    // A date read as a moment in UTC would show on the 14th west of Greenwich. This one is read as it is.
    expect(formatDate('2026-12-15', 'en')).toContain('15')
    expect(formatDate('2026-01-01', 'en')).toContain('2026')
    expect(formatDate('2026-01-01', 'en')).toContain('1')
  })

  it('shows the time somewhere else, with the zone', () => {
    const text = formatTimeIn('Asia/Tokyo', 'en', new Date('2026-07-15T03:30:00Z'))
    expect(text).toContain('12:30')
  })

  it('gives today in a zone: the date is not the same everywhere', () => {
    const at = new Date('2026-12-23T19:00:00Z')
    expect(todayIn('Pacific/Kiritimati', at)).toBe('2026-12-24')
    expect(todayIn('America/Los_Angeles', at)).toBe('2026-12-23')
  })

  it('proposes a reminder in some days, at a given hour of the zone', () => {
    const at = new Date('2026-12-23T19:00:00Z')
    expect(inDaysAt(7, 9, 'Pacific/Kiritimati', at)).toBe('2026-12-31T09:00')
    expect(inDaysAt(7, 9, 'America/Los_Angeles', at)).toBe('2026-12-30T09:00')
    // Over the end of a month and of a year.
    expect(inDaysAt(14, 9, 'UTC', new Date('2026-12-23T19:00:00Z'))).toBe('2027-01-06T09:00')
  })
})
