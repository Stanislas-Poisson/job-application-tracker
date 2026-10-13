import { normalizeStoredLanguages } from '../customLanguage'
import { LANGUAGES_KEY, installed } from '../customLanguages'
import { createTranslator, pluralText, resolveLocale } from '../i18n'
import { SCHEMA_KEY, SCHEMA_VERSION, keyOf } from '../persistence'
import type { StorageAdapter } from '../persistence/adapter'
import {
  type DueReminder,
  type Notified,
  type StoredData,
  dueReminders,
  nextDue,
  overdueCount,
  pruneNotified,
} from '../services/reminderDue'
import { SETTINGS_KEY, normalizeSettings } from '../settings'
import { formatInstant, resolveTimeZone } from '../utils/time'

export const NOTIFIED_KEY = 'jat:notified'
export const ALARM_NEXT = 'jat-reminder-next'
export const ALARM_POLL = 'jat-reminder-poll'
// A check now and then, for the reminders that came due while the browser was closed or asleep.
export const POLL_MINUTES = 15
// Above this many reminders due together (after days with the browser shut), one notification tells about all of them.
export const GROUP_OVER = 3
export const GROUP_ID = 'reminders:all'

// What the check needs from the browser. Passed in, so that it can be tested without one.
export interface BackgroundEnv {
  adapter: StorageAdapter
  now: () => Date
  // The language of the browser, to write the notification in.
  language: string
  // Shows a notification, kept on screen until it is closed when `persistent`. Rejects when it cannot be shown.
  notify: (id: string, title: string, message: string, persistent: boolean) => Promise<void>
  // Sets the alarm for the next moment a reminder is due, or clears it with null.
  scheduleNext: (when: number | null) => Promise<void>
  // Shows how many reminders are due on the icon of the extension (nothing for 0).
  setBadge: (count: number) => Promise<void>
}

export const notificationId = (reminder: Pick<DueReminder, 'id' | 'applicationId'>): string =>
  `reminder:${reminder.id}:${reminder.applicationId}`

// The application a notification is about, from its id. Null for the notification that groups several.
export function applicationOfNotification(id: string): string | null {
  const [kind, , applicationId] = id.split(':')
  return 'reminder' === kind && applicationId ? applicationId : null
}

export interface CheckResult {
  notified: string[]
  next: number | null
}

/**
 * Looks at the reminders and tells about the ones that came due, once each. It sets the alarm for the next one.
 *
 * It works on the data as it is stored, and does not write any of it: the only thing it keeps is the list of the reminders
 * it already told about. Nothing is shown when the user did not turn the notifications on. Data written by a newer
 * structure than this version knows is left alone.
 */
export async function checkReminders(env: BackgroundEnv): Promise<CheckResult> {
  const entities = ['reminders', 'applications', 'statuses', 'jobOffers', 'companies'] as const
  const stored = await env.adapter.get([SETTINGS_KEY, NOTIFIED_KEY, SCHEMA_KEY, LANGUAGES_KEY, ...entities.map(keyOf)])
  const none: CheckResult = { notified: [], next: null }

  const version = stored[SCHEMA_KEY]
  if ('number' === typeof version && version > SCHEMA_VERSION) {
    return none
  }
  const settings = normalizeSettings(stored[SETTINGS_KEY])

  const list = (entity: (typeof entities)[number]) => (stored[keyOf(entity)] as unknown[] | undefined) ?? []
  const data = Object.fromEntries(entities.map((entity) => [entity, list(entity)])) as unknown as StoredData
  const now = env.now()

  // The number on the icon needs no permission and is there whether or not the notifications are on. The alarm is for
  // the next moment it changes.
  await env.setBadge(overdueCount(data, now))
  const next = nextDue(data, {}, now)
  if (!settings.notifyReminders) {
    await env.scheduleNext(next)
    return { notified: [], next }
  }

  const notified: Notified = { ...(stored[NOTIFIED_KEY] as Notified | undefined) }

  // The language in use may be one the user added from a file.
  installed.value = normalizeStoredLanguages(stored[LANGUAGES_KEY])
  const translator = createTranslator(settings.locale, env.language)
  translator.setLocale(resolveLocale(settings.locale, env.language))
  const locale = resolveLocale(settings.locale, env.language)
  const timeZone = resolveTimeZone(settings.timeZone)

  const due = dueReminders(data, notified, now)
  const told: string[] = []
  const describe = (reminder: DueReminder) => {
    const about = [reminder.jobTitle, reminder.companyName].filter(Boolean).join(' · ')
    return [reminder.title, about, formatInstant(reminder.dueAt, { locale, timeZone })].filter(Boolean).join('\n')
  }
  const mark = (reminders: DueReminder[]) => {
    for (const reminder of reminders) {
      notified[reminder.id] = now.toISOString()
      told.push(reminder.id)
    }
  }

  try {
    if (due.length > GROUP_OVER) {
      // Many at once: one notification, with the first few, instead of a pile of alerts.
      const shown = due.slice(0, GROUP_OVER).map((reminder) => `- ${reminder.title}`)
      const more = due.length - shown.length
      const message = [
        pluralText(translator, locale, 'notify.many', due.length),
        ...shown,
        0 < more ? translator.__('notify.more', { count: more }) : '',
      ]
        .filter(Boolean)
        .join('\n')
      await env.notify(GROUP_ID, translator.__('notify.title'), message, settings.notifyPersistent)
      mark(due)
    } else {
      for (const reminder of due) {
        try {
          await env.notify(
            notificationId(reminder),
            translator.__('notify.title'),
            describe(reminder),
            settings.notifyPersistent
          )
          mark([reminder])
        } catch {
          // It could not be shown (the permission was taken back): it is not marked, so it is tried again.
        }
      }
    }
  } catch {
    // The grouped notification could not be shown: none is marked, they are tried again.
  }

  const kept = pruneNotified(data, notified)
  if (JSON.stringify(kept) !== JSON.stringify(stored[NOTIFIED_KEY] ?? {})) {
    await env.adapter.set({ [NOTIFIED_KEY]: kept })
  }

  await env.scheduleNext(next)
  return { notified: told, next }
}
