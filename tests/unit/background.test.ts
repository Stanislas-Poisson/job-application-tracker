import { describe, expect, it, vi } from 'vitest'
import {
  ALARM_NEXT,
  type BackgroundEnv,
  GROUP_ID,
  GROUP_OVER,
  NOTIFIED_KEY,
  applicationOfNotification,
  checkReminders,
  notificationId,
  sendTestNotification,
} from '../../src/background/reminders'
import { SCHEMA_KEY, SCHEMA_VERSION, keyOf } from '../../src/persistence'
import { memoryAdapter } from '../../src/persistence/adapter'
import { SETTINGS_KEY } from '../../src/settings'

const NOW = new Date('2026-10-13T10:00:00.000Z')

// The first of a list that is known not to be empty.
function first<T>(list: T[]): T {
  const item = list[0]
  if (undefined === item) {
    throw new Error('The list is empty.')
  }
  return item
}

// The data of an extension with two reminders: one due at 7:00, one tomorrow.
const stored = (
  settings: Record<string, unknown> = { notifyReminders: true, locale: 'en', timeZone: 'Europe/Paris' }
) => ({
  [SCHEMA_KEY]: SCHEMA_VERSION,
  [SETTINGS_KEY]: settings,
  [keyOf('reminders')]: [
    { id: 'r1', applicationId: 'a1', title: 'Follow up', dueAt: '2026-10-13T07:00:00.000Z', doneAt: null },
    { id: 'r2', applicationId: 'a1', title: 'Call back', dueAt: '2026-10-14T07:00:00.000Z', doneAt: null },
  ],
  [keyOf('applications')]: [{ id: 'a1', jobOfferId: 'o1', statusId: 's1', archived: false }],
  [keyOf('statuses')]: [
    { id: 's1', isFinal: false },
    { id: 's2', isFinal: true },
  ],
  [keyOf('jobOffers')]: [{ id: 'o1', title: 'Backend developer', companyId: 'c1' }],
  [keyOf('companies')]: [{ id: 'c1', name: 'Acme' }],
})

function setup(initial: Record<string, unknown> = stored()) {
  const adapter = memoryAdapter(initial)
  const shown: { id: string; title: string; message: string; persistent: boolean }[] = []
  const badges: number[] = []
  const alarms: (number | null)[] = []
  let clock = NOW
  const env: BackgroundEnv = {
    adapter,
    now: () => clock,
    language: 'en-US',
    notify: async (id, title, message, persistent) => void shown.push({ id, title, message, persistent }),
    scheduleNext: async (when) => void alarms.push(when),
    setBadge: async (count) => void badges.push(count),
  }
  return { adapter, env, shown, badges, alarms, at: (date: Date) => (clock = date) }
}

describe('checkReminders', () => {
  it('tells about a reminder that came due, in the language and the time zone of the user', async () => {
    const { env, shown } = setup()
    const result = await checkReminders(env)

    expect(result.notified).toEqual(['r1'])
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ id: 'reminder:r1:a1', title: 'Reminder' })
    // The title, the offer and the company, and the moment in the zone of the settings (9:00 in Paris).
    expect(shown[0]?.message).toContain('Follow up')
    expect(shown[0]?.message).toContain('Backend developer · Acme')
    expect(shown[0]?.message).toMatch(/9:00\s?AM/)
  })

  it('writes in French when the settings say so', async () => {
    const { env, shown } = setup(stored({ notifyReminders: true, locale: 'fr', timeZone: 'Europe/Paris' }))
    await checkReminders(env)
    expect(shown[0]?.title).toBe('Rappel')
    expect(shown[0]?.message).toContain('09:00')
  })

  it('tells about a reminder once, however many times it looks', async () => {
    const { env, shown, adapter } = setup()
    await checkReminders(env)
    await checkReminders(env)
    await checkReminders(env)

    expect(shown).toHaveLength(1)
    expect(Object.keys(adapter.data[NOTIFIED_KEY] as object)).toEqual(['r1'])
  })

  it('tells about the next one when its moment comes, and about the ones missed while the browser was closed', async () => {
    const { env, shown, at } = setup()
    await checkReminders(env)

    at(new Date('2026-10-14T07:00:01.000Z'))
    await checkReminders(env)
    expect(shown.map((entry) => entry.id)).toEqual(['reminder:r1:a1', 'reminder:r2:a1'])

    // A day later, the browser was shut all the time: nothing is told twice.
    at(new Date('2026-10-20T07:00:00.000Z'))
    await checkReminders(env)
    expect(shown).toHaveLength(2)
  })

  it('sets the alarm for the next moment, and the number on the icon', async () => {
    const { env, alarms, badges } = setup()
    await checkReminders(env)
    expect(alarms.at(-1)).toBe(Date.parse('2026-10-14T07:00:00.000Z'))
    // One is due and not done: it is counted until it is done, though it was told about.
    expect(badges.at(-1)).toBe(1)
  })

  it('counts both when both are due, and nothing when none is', async () => {
    const { env, badges, at } = setup()
    at(new Date('2026-10-15T00:00:00.000Z'))
    await checkReminders(env)
    expect(badges.at(-1)).toBe(2)

    at(new Date('2026-10-01T00:00:00.000Z'))
    await checkReminders(env)
    expect(badges.at(-1)).toBe(0)
  })

  it('shows the number and sets the alarm, but tells nothing, when the notifications are off', async () => {
    const { env, shown, badges, alarms, adapter } = setup(stored({ notifyReminders: false }))
    const result = await checkReminders(env)

    expect(shown).toEqual([])
    expect(result.notified).toEqual([])
    expect(badges.at(-1)).toBe(1)
    expect(alarms.at(-1)).toBe(Date.parse('2026-10-14T07:00:00.000Z'))
    expect(adapter.data[NOTIFIED_KEY]).toBeUndefined()
  })

  it('does not tell about, nor count, a reminder that is done or of a finished application', async () => {
    const data = stored()
    first(data[keyOf('reminders')] as { doneAt: string | null }[]).doneAt = '2026-10-13T08:00:00.000Z'
    const done = setup(data)
    await checkReminders(done.env)
    expect(done.shown).toEqual([])
    expect(done.badges.at(-1)).toBe(0)

    const finished = stored()
    first(finished[keyOf('applications')] as { statusId: string }[]).statusId = 's2'
    const over = setup(finished)
    await checkReminders(over.env)
    expect(over.shown).toEqual([])
    expect(over.badges.at(-1)).toBe(0)
  })

  it('tries again later when the notification could not be shown', async () => {
    const { env, adapter } = setup()
    const notify = vi.fn().mockRejectedValueOnce(new Error('no permission')).mockResolvedValue(undefined)
    env.notify = notify

    expect((await checkReminders(env)).notified).toEqual([])
    expect(adapter.data[NOTIFIED_KEY]).toBeUndefined()
    expect((await checkReminders(env)).notified).toEqual(['r1'])
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('forgets a reminder that was done, so that undone it is told about again', async () => {
    const { env, shown, adapter } = setup()
    await checkReminders(env)

    const reminders = adapter.data[keyOf('reminders')] as { doneAt: string | null }[]
    first(reminders).doneAt = '2026-10-13T08:00:00.000Z'
    await checkReminders(env)
    expect(adapter.data[NOTIFIED_KEY]).toEqual({})

    first(reminders).doneAt = null
    await checkReminders(env)
    expect(shown).toHaveLength(2)
  })

  it('leaves data of a newer structure alone', async () => {
    const { env, shown, badges, alarms, adapter } = setup({ ...stored(), [SCHEMA_KEY]: SCHEMA_VERSION + 1 })
    const before = JSON.stringify(adapter.data)
    expect(await checkReminders(env)).toEqual({ notified: [], next: null })
    expect(shown).toEqual([])
    expect(badges).toEqual([])
    expect(alarms).toEqual([])
    expect(JSON.stringify(adapter.data)).toBe(before)
  })

  it('copes with an empty storage', async () => {
    const { env, shown, badges } = setup({})
    expect(await checkReminders(env)).toEqual({ notified: [], next: null })
    expect(shown).toEqual([])
    expect(badges.at(-1)).toBe(0)
  })
})

describe('the alert', () => {
  it('stays on screen until it is closed, unless the user chose otherwise', async () => {
    const keep = setup()
    await checkReminders(keep.env)
    expect(keep.shown[0]?.persistent).toBe(true)

    const brief = setup(stored({ notifyReminders: true, notifyPersistent: false }))
    await checkReminders(brief.env)
    expect(brief.shown[0]?.persistent).toBe(false)
  })

  it('is one notification when many reminders come due together, not a pile', async () => {
    const data = stored()
    data[keyOf('reminders')] = Array.from({ length: GROUP_OVER + 2 }, (_, index) => ({
      id: `r${index}`,
      applicationId: 'a1',
      title: `Reminder ${index}`,
      dueAt: `2026-10-0${index + 1}T07:00:00.000Z`,
      doneAt: null,
    }))
    const { env, shown, badges, adapter } = setup(data)
    const result = await checkReminders(env)

    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ id: GROUP_ID, title: 'Reminder' })
    expect(shown[0]?.message).toContain('5 reminders are due')
    expect(shown[0]?.message).toContain('- Reminder 0')
    expect(shown[0]?.message).not.toContain('- Reminder 4')
    expect(shown[0]?.message).toContain('and 2 more')
    // All of them are told about, once, and all of them are counted on the icon.
    expect(result.notified).toHaveLength(5)
    expect(Object.keys(adapter.data[NOTIFIED_KEY] as object)).toHaveLength(5)
    expect(badges.at(-1)).toBe(5)
    await checkReminders(env)
    expect(shown).toHaveLength(1)
  })

  it('does not group as many as the limit', async () => {
    const data = stored()
    data[keyOf('reminders')] = Array.from({ length: GROUP_OVER }, (_, index) => ({
      id: `r${index}`,
      applicationId: 'a1',
      title: `Reminder ${index}`,
      dueAt: `2026-10-0${index + 1}T07:00:00.000Z`,
      doneAt: null,
    }))
    const { env, shown } = setup(data)
    await checkReminders(env)
    expect(shown).toHaveLength(GROUP_OVER)
  })

  it('tries the group again when it could not be shown', async () => {
    const data = stored()
    data[keyOf('reminders')] = Array.from({ length: GROUP_OVER + 1 }, (_, index) => ({
      id: `r${index}`,
      applicationId: 'a1',
      title: `Reminder ${index}`,
      dueAt: `2026-10-0${index + 1}T07:00:00.000Z`,
      doneAt: null,
    }))
    const { env, adapter } = setup(data)
    env.notify = vi.fn().mockRejectedValueOnce(new Error('no permission')).mockResolvedValue(undefined)
    expect((await checkReminders(env)).notified).toEqual([])
    expect(adapter.data[NOTIFIED_KEY]).toBeUndefined()
    expect((await checkReminders(env)).notified).toHaveLength(GROUP_OVER + 1)
  })
})

describe('the id of a notification', () => {
  it('carries the application to open on a click', () => {
    expect(notificationId({ id: 'r1', applicationId: 'a1' })).toBe('reminder:r1:a1')
    expect(applicationOfNotification('reminder:r1:a1')).toBe('a1')
    expect(applicationOfNotification('other:r1:a1')).toBeNull()
    expect(applicationOfNotification('reminder:r1')).toBeNull()
    // The grouped one opens the board, not an application.
    expect(applicationOfNotification(GROUP_ID)).toBeNull()
    expect(ALARM_NEXT).toBe('jat-reminder-next')
  })
})

describe('the test notification', () => {
  it('shows every plural form of the language in use, and the line "and more"', async () => {
    const { env, shown } = setup(stored({ notifyReminders: false, locale: 'ar', timeZone: 'Europe/Paris' }))
    await sendTestNotification(env)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.title).toBe('تذكير')
    // Arabic has six forms: zero, one, two, few, many, other; and the line "and more".
    expect(shown[0]?.message.split('\n')).toHaveLength(7)
  })

  it('shows the notify texts of a file added in the developer mode over the ones of the extension', async () => {
    const language = {
      code: 'fr',
      name: 'Mon français',
      dir: 'ltr',
      script: 'Latn',
      messages: { notify: { title: 'Mon rappel' } },
    }
    const { env, shown } = setup({
      ...stored({ notifyReminders: false, locale: 'fr', developerMode: true, timeZone: 'Europe/Paris' }),
      'jat:languages': [language],
    })
    await sendTestNotification(env)
    expect(shown[0]?.title).toBe('Mon rappel')
    // The text it did not carry is English.
    expect(shown[0]?.message).toContain('reminders are due')
  })

  it('rejects when the notification cannot be shown', async () => {
    const { env } = setup()
    env.notify = async () => {
      throw new Error('no permission')
    }
    await expect(sendTestNotification(env)).rejects.toThrow('no permission')
  })
})
