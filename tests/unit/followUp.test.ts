import { describe, expect, it } from 'vitest'
import { suggestFollowUp } from '../../src/services/followUp'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'

const PARIS = 'Europe/Paris'
// Tuesday 2026-10-13, noon in Paris.
const NOW = new Date('2026-10-13T10:00:00Z')
const applied = { appliedAt: '2026-10-12T08:00:00.000Z', archived: false, status: { isFinal: false }, reminders: [] }

describe('suggestFollowUp', () => {
  it('suggests the morning of the day, some days later, in the time zone of the user', () => {
    // 9:00 in Paris in October is 07:00 UTC.
    expect(suggestFollowUp(applied, 7, PARIS, NOW)).toEqual({ dueAt: '2026-10-20T07:00:00.000Z', days: 7 })
    expect(suggestFollowUp(applied, 3, PARIS, NOW)?.dueAt).toBe('2026-10-16T07:00:00.000Z')
    // The same morning is another moment in another zone.
    expect(suggestFollowUp(applied, 7, 'America/New_York', NOW)?.dueAt).toBe('2026-10-20T13:00:00.000Z')
  })

  it('follows the clocks going back', () => {
    // On 2026-10-25 the clocks go back in Paris: 9:00 is then 08:00 UTC.
    expect(suggestFollowUp(applied, 13, PARIS, NOW)?.dueAt).toBe('2026-10-26T08:00:00.000Z')
  })

  it('is not offered before the user applied', () => {
    expect(suggestFollowUp({ ...applied, appliedAt: null }, 7, PARIS, NOW)).toBeNull()
  })

  it('is not offered for an archived application, nor one at the end of its road', () => {
    expect(suggestFollowUp({ ...applied, archived: true }, 7, PARIS, NOW)).toBeNull()
    expect(suggestFollowUp({ ...applied, status: { isFinal: true } }, 7, PARIS, NOW)).toBeNull()
    expect(suggestFollowUp({ ...applied, status: null }, 7, PARIS, NOW)).not.toBeNull()
  })

  it('is not offered while a reminder is waiting, and is again once it is done', () => {
    expect(suggestFollowUp({ ...applied, reminders: [{ doneAt: null }] }, 7, PARIS, NOW)).toBeNull()
    expect(
      suggestFollowUp({ ...applied, reminders: [{ doneAt: '2026-10-13T09:00:00.000Z' }] }, 7, PARIS, NOW)
    ).not.toBeNull()
    expect(suggestFollowUp({ ...applied, reminders: undefined }, 7, PARIS, NOW)).not.toBeNull()
  })
})

describe('the delay of the follow-up', () => {
  it('is a number of days from 1 to 60, seven by default', () => {
    expect(DEFAULT_SETTINGS.followUpDays).toBe(7)
    expect(normalizeSettings({ followUpDays: 14 }).followUpDays).toBe(14)
    expect(normalizeSettings({ followUpDays: 0 }).followUpDays).toBe(7)
    expect(normalizeSettings({ followUpDays: 61 }).followUpDays).toBe(7)
    expect(normalizeSettings({ followUpDays: 2.5 }).followUpDays).toBe(7)
    expect(normalizeSettings({ followUpDays: 'ten' }).followUpDays).toBe(7)
  })
})
