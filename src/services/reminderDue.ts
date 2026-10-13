// Which reminders are due, from the data as it is stored. It works on plain records, with no store and no browser, because
// the background of the extension (which has neither) uses it, and so do the tests.

export interface StoredData {
  reminders: { id: string; applicationId: string; title: string; dueAt: string; doneAt: string | null }[]
  applications: { id: string; jobOfferId: string; statusId: string | null; archived: boolean }[]
  statuses: { id: string; isFinal: boolean }[]
  jobOffers: { id: string; title: string; companyId: string | null }[]
  companies: { id: string; name: string }[]
}

// The reminders already notified, by id, with the moment they were.
export type Notified = Record<string, string>

export interface DueReminder {
  id: string
  applicationId: string
  title: string
  dueAt: string
  jobTitle: string
  companyName: string
}

// A reminder that still counts: not done, and its application is neither archived nor at the end of its road (a final
// column ends the application: no more reminders are due).
function live(data: StoredData) {
  const finals = new Set(data.statuses.filter((status) => status.isFinal).map((status) => status.id))
  const applications = new Map(data.applications.map((application) => [application.id, application]))
  return data.reminders.flatMap((reminder) => {
    const application = applications.get(reminder.applicationId)
    const open = null === reminder.doneAt && undefined !== application && !application.archived
    return open && !(null !== application.statusId && finals.has(application.statusId))
      ? [{ reminder, application }]
      : []
  })
}

export function dueReminders(data: StoredData, notified: Notified, now: Date): DueReminder[] {
  const offers = new Map(data.jobOffers.map((offer) => [offer.id, offer]))
  const companies = new Map(data.companies.map((company) => [company.id, company.name]))
  return live(data)
    .filter(({ reminder }) => !(reminder.id in notified) && Date.parse(reminder.dueAt) <= now.getTime())
    .sort((a, b) => a.reminder.dueAt.localeCompare(b.reminder.dueAt))
    .map(({ reminder, application }) => {
      const offer = offers.get(application.jobOfferId)
      return {
        id: reminder.id,
        applicationId: application.id,
        title: reminder.title,
        dueAt: reminder.dueAt,
        jobTitle: offer?.title ?? '',
        companyName: (offer?.companyId ? companies.get(offer.companyId) : undefined) ?? '',
      }
    })
}

// How many reminders are due and not done: the number shown on the icon of the extension. A reminder that was notified is
// still counted until the user has done it.
export function overdueCount(data: StoredData, now: Date): number {
  return live(data).filter(({ reminder }) => Date.parse(reminder.dueAt) <= now.getTime()).length
}

// The next moment a reminder will be due (milliseconds), to set the alarm for. Null when none is waiting.
export function nextDue(data: StoredData, notified: Notified, now: Date): number | null {
  const times = live(data)
    .filter(({ reminder }) => !(reminder.id in notified))
    .map(({ reminder }) => Date.parse(reminder.dueAt))
    .filter((time) => !Number.isNaN(time) && time > now.getTime())
  return 0 === times.length ? null : Math.min(...times)
}

// The notified list without the reminders that are gone or done: it must not grow for ever, and a reminder that is
// undone (ticked, then unticked) is a new one to notify.
export function pruneNotified(data: StoredData, notified: Notified): Notified {
  const open = new Set(data.reminders.filter((reminder) => null === reminder.doneAt).map((reminder) => reminder.id))
  return Object.fromEntries(Object.entries(notified).filter(([id]) => open.has(id)))
}
