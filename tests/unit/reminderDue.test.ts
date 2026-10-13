import { describe, expect, it } from 'vitest'
import { type StoredData, dueReminders, nextDue, overdueCount, pruneNotified } from '../../src/services/reminderDue'

const NOW = new Date('2026-10-13T10:00:00.000Z')

const data = (changes: Partial<StoredData> = {}): StoredData => ({
  reminders: [{ id: 'r1', applicationId: 'a1', title: 'Follow up', dueAt: '2026-10-13T07:00:00.000Z', doneAt: null }],
  applications: [{ id: 'a1', jobOfferId: 'o1', statusId: 's1', archived: false }],
  statuses: [
    { id: 's1', isFinal: false },
    { id: 's2', isFinal: true },
  ],
  jobOffers: [{ id: 'o1', title: 'Backend developer', companyId: 'c1' }],
  companies: [{ id: 'c1', name: 'Acme' }],
  ...changes,
})

describe('dueReminders', () => {
  it('lists a reminder whose moment has come, with its offer and company', () => {
    expect(dueReminders(data(), {}, NOW)).toEqual([
      {
        id: 'r1',
        applicationId: 'a1',
        title: 'Follow up',
        dueAt: '2026-10-13T07:00:00.000Z',
        jobTitle: 'Backend developer',
        companyName: 'Acme',
      },
    ])
  })

  it('counts a reminder due at this very moment, and not one that is not due yet', () => {
    const reminders = [
      { id: 'now', applicationId: 'a1', title: 'Now', dueAt: NOW.toISOString(), doneAt: null },
      { id: 'later', applicationId: 'a1', title: 'Later', dueAt: '2026-10-13T10:00:00.001Z', doneAt: null },
    ]
    expect(dueReminders(data({ reminders }), {}, NOW).map((due) => due.id)).toEqual(['now'])
  })

  it('does not list a reminder twice: once notified, it is not due again', () => {
    expect(dueReminders(data(), { r1: '2026-10-13T07:00:05.000Z' }, NOW)).toEqual([])
  })

  it('lists the ones missed while the browser was closed, the oldest first', () => {
    const reminders = [
      { id: 'b', applicationId: 'a1', title: 'B', dueAt: '2026-10-10T09:00:00.000Z', doneAt: null },
      { id: 'a', applicationId: 'a1', title: 'A', dueAt: '2026-10-01T09:00:00.000Z', doneAt: null },
    ]
    expect(dueReminders(data({ reminders }), {}, NOW).map((due) => due.id)).toEqual(['a', 'b'])
  })

  it('ignores a reminder that is done, one of an archived application, and one of a finished application', () => {
    const done = [
      {
        id: 'r1',
        applicationId: 'a1',
        title: 'x',
        dueAt: '2026-10-01T00:00:00.000Z',
        doneAt: '2026-10-02T00:00:00.000Z',
      },
    ]
    expect(dueReminders(data({ reminders: done }), {}, NOW)).toEqual([])
    expect(
      dueReminders(data({ applications: [{ id: 'a1', jobOfferId: 'o1', statusId: 's1', archived: true }] }), {}, NOW)
    ).toEqual([])
    expect(
      dueReminders(data({ applications: [{ id: 'a1', jobOfferId: 'o1', statusId: 's2', archived: false }] }), {}, NOW)
    ).toEqual([])
  })

  it('ignores a reminder whose application is gone, and copes with a missing offer or company', () => {
    expect(dueReminders(data({ applications: [] }), {}, NOW)).toEqual([])
    const [due] = dueReminders(data({ jobOffers: [], companies: [] }), {}, NOW)
    expect(due).toMatchObject({ jobTitle: '', companyName: '' })
    expect(
      dueReminders(data({ jobOffers: [{ id: 'o1', title: 'Dev', companyId: null }] }), {}, NOW)[0]?.companyName
    ).toBe('')
    expect(
      dueReminders(data({ applications: [{ id: 'a1', jobOfferId: 'o1', statusId: null, archived: false }] }), {}, NOW)
    ).toHaveLength(1)
  })

  it('reads a moment it cannot as never due', () => {
    const reminders = [{ id: 'r1', applicationId: 'a1', title: 'x', dueAt: 'soon', doneAt: null }]
    expect(dueReminders(data({ reminders }), {}, NOW)).toEqual([])
    expect(nextDue(data({ reminders }), {}, NOW)).toBeNull()
  })
})

describe('nextDue', () => {
  const at = (iso: string, id = 'x') => ({ id, applicationId: 'a1', title: id, dueAt: iso, doneAt: null })

  it('is the soonest moment still to come', () => {
    const reminders = [
      at('2026-10-20T07:00:00.000Z', 'late'),
      at('2026-10-14T07:00:00.000Z', 'soon'),
      at('2026-10-01T07:00:00.000Z', 'past'),
    ]
    expect(nextDue(data({ reminders }), {}, NOW)).toBe(Date.parse('2026-10-14T07:00:00.000Z'))
  })

  it('is null when nothing is waiting, or when what waits is done, notified or of a finished application', () => {
    expect(nextDue(data({ reminders: [] }), {}, NOW)).toBeNull()
    expect(nextDue(data({ reminders: [at('2026-10-20T07:00:00.000Z', 'r1')] }), { r1: 'x' }, NOW)).toBeNull()
    expect(
      nextDue(data({ reminders: [{ ...at('2026-10-20T07:00:00.000Z'), doneAt: '2026-10-13T00:00:00.000Z' }] }), {}, NOW)
    ).toBeNull()
    expect(
      nextDue(
        data({
          reminders: [at('2026-10-20T07:00:00.000Z')],
          applications: [{ id: 'a1', jobOfferId: 'o1', statusId: 's2', archived: false }],
        }),
        {},
        NOW
      )
    ).toBeNull()
  })
})

describe('pruneNotified', () => {
  it('forgets the reminders that are gone or done, and keeps the ones still open', () => {
    const reminders = [
      { id: 'open', applicationId: 'a1', title: 'x', dueAt: '2026-10-01T00:00:00.000Z', doneAt: null },
      {
        id: 'done',
        applicationId: 'a1',
        title: 'x',
        dueAt: '2026-10-01T00:00:00.000Z',
        doneAt: '2026-10-02T00:00:00.000Z',
      },
    ]
    expect(pruneNotified(data({ reminders }), { open: 'a', done: 'b', gone: 'c' })).toEqual({ open: 'a' })
  })
})

describe('overdueCount', () => {
  it('counts what is due and not done, whether or not it was told about', () => {
    const reminders = [
      { id: 'a', applicationId: 'a1', title: 'x', dueAt: '2026-10-01T00:00:00.000Z', doneAt: null },
      { id: 'b', applicationId: 'a1', title: 'x', dueAt: NOW.toISOString(), doneAt: null },
      { id: 'c', applicationId: 'a1', title: 'x', dueAt: '2026-10-20T00:00:00.000Z', doneAt: null },
      {
        id: 'd',
        applicationId: 'a1',
        title: 'x',
        dueAt: '2026-10-01T00:00:00.000Z',
        doneAt: '2026-10-02T00:00:00.000Z',
      },
    ]
    expect(overdueCount(data({ reminders }), NOW)).toBe(2)
    expect(overdueCount(data({ reminders: [] }), NOW)).toBe(0)
  })
})
