import type { CountryCode } from 'libphonenumber-js/min'
import { useRepo } from 'pinia-orm'
import {
  Activity,
  Application,
  ApplicationContact,
  Company,
  Contact,
  ContactMethod,
  JobOffer,
  Note,
  Reminder,
  Source,
  Status,
} from '../models'
import type { ActivityType } from '../models/Activity'
import type { ContactRole } from '../models/ApplicationContact'
import type { WorkMode } from '../models/JobOffer'
import { isInstant, isPlainDate } from '../utils/time'
import { type ContactInput, normalizeContactInput } from './contacts'

export interface CaptureInput {
  title: string
  companyName: string
  url?: string | null
  location?: string | null
  contractType?: string | null
  workMode?: WorkMode | null
  description?: string | null
  // The day the offer was published, as a plain date (YYYY-MM-DD).
  postedOn?: string | null
  // The key of the status the application starts in. The first column when it is missing or unknown.
  statusKey?: string
}

const now = () => new Date().toISOString()

const byOrder = (a: Status, b: Status) => a.order - b.order

// The source an address belongs to, found from its host name. The "other" source when none matches.
export function sourceFor(url: string | null | undefined): Source | null {
  const sources = useRepo(Source).all()
  const fallback = sources.find((source) => 'other' === source.key) ?? null
  if (!url) {
    return fallback
  }

  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return fallback
  }

  const found = sources.find((source) => {
    if (!source.url) {
      return false
    }
    // candidat.francetravail.fr and www.apec.fr are matched by their domain, so any sub-domain of it counts.
    const domain = new URL(source.url).hostname.replace(/^(www|candidat)\./, '')
    return host === domain || host.endsWith(`.${domain}`)
  })
  return found ?? fallback
}

export function logActivity(applicationId: string, type: ActivityType, title: string, ids: Partial<Activity> = {}) {
  return useRepo(Activity).save({ applicationId, type, title, occurredAt: now(), ...ids })
}

// The company with that name, whatever its case, or a new one.
export function findOrCreateCompany(name: string): Company {
  const companies = useRepo(Company)
  const wanted = name.trim().toLowerCase()
  const existing = companies.all().find((company) => company.name.trim().toLowerCase() === wanted)
  return existing ?? companies.save({ name: name.trim() })
}

// Saves an offer the user is looking at and starts following it: the company, the offer, the application.
export function captureOffer(input: CaptureInput): Application {
  if (input.postedOn && !isPlainDate(input.postedOn)) {
    throw new Error(`The publication date must be a plain date (YYYY-MM-DD): ${input.postedOn}`)
  }
  const statuses = useRepo(Status).all().sort(byOrder)
  const status = statuses.find((candidate) => candidate.key === input.statusKey) ?? statuses[0] ?? null

  const company = findOrCreateCompany(input.companyName)
  const offer = useRepo(JobOffer).save({
    companyId: company.id,
    sourceId: sourceFor(input.url)?.id ?? null,
    title: input.title.trim(),
    url: input.url ?? null,
    location: input.location ?? null,
    contractType: input.contractType ?? null,
    workMode: input.workMode ?? null,
    description: input.description ?? null,
    postedOn: input.postedOn ?? null,
  })

  const position = nextPosition(status?.id ?? null)
  const application = useRepo(Application).save({
    jobOfferId: offer.id,
    statusId: status?.id ?? null,
    position,
    appliedAt: 'applied' === status?.key ? now() : null,
  })

  logActivity(application.id, 'created', input.title.trim(), { toStatusId: status?.id ?? null })
  return application
}

function nextPosition(statusId: string | null): number {
  const positions = useRepo(Application)
    .where('statusId', statusId)
    .get()
    .map((application) => application.position)
  return 0 === positions.length ? 0 : Math.max(...positions) + 1
}

// Moves an application to a column, at the end of it, and writes it in the timeline.
export function moveApplication(applicationId: string, statusId: string) {
  const applications = useRepo(Application)
  const application = applications.find(applicationId)
  const target = useRepo(Status).find(statusId)
  if (!application || !target || application.statusId === statusId) {
    return application
  }

  const from = application.statusId
  applications.where('id', applicationId).update({
    statusId,
    position: nextPosition(statusId),
    updatedAt: now(),
    ...('applied' === target.key && !application.appliedAt ? { appliedAt: now() } : {}),
  })
  logActivity(applicationId, 'status_changed', target.label, { fromStatusId: from, toStatusId: statusId })
  return applications.find(applicationId)
}

export type Noteable = 'applications' | 'companies' | 'contacts'

export function addNote(type: Noteable, id: string, body: string) {
  return useRepo(Note).save({ noteableType: type, noteableId: id, body: body.trim() })
}

// The moment is in UTC: the page turns what the user typed in their time zone into one before it calls this.
export function addReminder(applicationId: string, title: string, dueAt: string) {
  if (!isInstant(dueAt)) {
    throw new Error(`A reminder is due at a moment in UTC (ending with Z): ${dueAt}`)
  }
  return useRepo(Reminder).save({ applicationId, title: title.trim(), dueAt })
}

export function setReminderDone(reminderId: string, done: boolean) {
  useRepo(Reminder)
    .where('id', reminderId)
    .update({ doneAt: done ? now() : null })
}

// Creates a contact in the company of the offer, with its ways to reach it, and links it to the application. The fields
// are put in their canonical forms first (see normalizeContactInput): an invalid one throws a ContactError and nothing
// is saved.
export function addContact(
  applicationId: string,
  input: ContactInput,
  link: ContactRole = 'other',
  options: { defaultCountry?: CountryCode } = {}
) {
  const { fields, methods } = normalizeContactInput(input, options)
  const application = useRepo(Application).with('jobOffer').find(applicationId)
  const contact = useRepo(Contact).save({
    ...fields,
    companyId: application?.jobOffer?.companyId ?? null,
  })
  for (const method of methods) {
    useRepo(ContactMethod).save({ ...method, contactId: contact.id })
  }
  useRepo(ApplicationContact).save({ applicationId, contactId: contact.id, role: link })
  return contact
}

export function unlinkContact(applicationId: string, contactId: string) {
  useRepo(ApplicationContact).where('applicationId', applicationId).where('contactId', contactId).delete()
}

export function setArchived(applicationId: string, archived: boolean) {
  useRepo(Application).where('id', applicationId).update({ archived, updatedAt: now() })
}

// Removes an application and what hangs on it. The offer and the company stay: other applications may use them.
export function deleteApplication(applicationId: string) {
  useRepo(Activity).where('applicationId', applicationId).delete()
  useRepo(Reminder).where('applicationId', applicationId).delete()
  useRepo(ApplicationContact).where('applicationId', applicationId).delete()
  useRepo(Note).where('noteableType', 'applications').where('noteableId', applicationId).delete()
  useRepo(Application).destroy(applicationId)
}
