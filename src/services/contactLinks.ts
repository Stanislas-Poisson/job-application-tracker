import { useRepo } from 'pinia-orm'
import { Application, ApplicationContact, Company, Contact, ContactCompany } from '../models'
import type { ContactRole } from '../models/ApplicationContact'
import { isPlainDate } from '../utils/time'
import { findOrCreateCompany } from './applications'

// A link that cannot be saved. The code is the key of the message to show.
export class ContactLinkError extends Error {
  constructor(public readonly code: 'contact' | 'company' | 'date' | 'order' | 'twice') {
    super(code)
  }
}

export interface CompanyLinkInput {
  title?: string | null
  startedOn?: string | null
  endedOn?: string | null
}

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim()
  return '' === text ? null : text
}

/**
 * The companies of a person, the ones they work for now first (the latest start first), then the ones they left (the
 * latest end first). A link with no date at all is the oldest of its group.
 */
export function companiesOf(contactId: string): ContactCompany[] {
  const links = useRepo(ContactCompany).with('company').where('contactId', contactId).get()
  const current = (link: ContactCompany) => (null === link.endedOn ? 0 : 1)
  return links.sort(
    (a, b) =>
      current(a) - current(b) ||
      (null === a.endedOn ? 0 : (b.endedOn ?? '').localeCompare(a.endedOn)) ||
      (b.startedOn ?? '').localeCompare(a.startedOn ?? '')
  )
}

// `Contact.companyId` is the main company: the first of the list. It is kept in step with the links after each change.
export function syncMainCompany(contactId: string) {
  const [main] = companiesOf(contactId)
  useRepo(Contact)
    .where('id', contactId)
    .update({ companyId: main?.companyId ?? null })
}

/**
 * Ties a person to a company, by its name (found, or made when it is new), with the title they have there and the period.
 * The dates are plain dates (YYYY-MM-DD) and optional; the last day cannot come before the first one; the same company
 * from the same first day is kept once. Nothing is made when the link is refused.
 */
export function addCompanyLink(contactId: string, companyName: string, input: CompanyLinkInput = {}): ContactCompany {
  if (!useRepo(Contact).find(contactId)) {
    throw new ContactLinkError('contact')
  }
  if ('' === companyName.trim()) {
    throw new ContactLinkError('company')
  }
  const startedOn = clean(input.startedOn)
  const endedOn = clean(input.endedOn)
  if ((null !== startedOn && !isPlainDate(startedOn)) || (null !== endedOn && !isPlainDate(endedOn))) {
    throw new ContactLinkError('date')
  }
  if (null !== startedOn && null !== endedOn && endedOn < startedOn) {
    throw new ContactLinkError('order')
  }

  const wanted = companyName.trim().toLowerCase()
  const known = useRepo(Company)
    .all()
    .find((company) => company.name.trim().toLowerCase() === wanted)
  if (known && companiesOf(contactId).some((link) => link.companyId === known.id && link.startedOn === startedOn)) {
    throw new ContactLinkError('twice')
  }

  const company = known ?? findOrCreateCompany(companyName)
  const link = useRepo(ContactCompany).save({
    contactId,
    companyId: company.id,
    title: clean(input.title),
    startedOn,
    endedOn,
  })
  syncMainCompany(contactId)
  return link
}

export function removeCompanyLink(linkId: string) {
  const link = useRepo(ContactCompany).find(linkId)
  useRepo(ContactCompany).destroy(linkId)
  if (link) {
    syncMainCompany(link.contactId)
  }
}

// The person left the company: the last day. Refused before the first day.
export function endCompanyLink(linkId: string, endedOn: string) {
  const link = useRepo(ContactCompany).find(linkId)
  if (!link) {
    throw new ContactLinkError('contact')
  }
  if (!isPlainDate(endedOn)) {
    throw new ContactLinkError('date')
  }
  if (null !== link.startedOn && endedOn < link.startedOn) {
    throw new ContactLinkError('order')
  }
  useRepo(ContactCompany).where('id', linkId).update({ endedOn })
  syncMainCompany(link.contactId)
}

/** Links a person who is known already to another application: the same person can help with several offers. */
export function linkContact(applicationId: string, contactId: string, role: ContactRole = 'other') {
  if (!useRepo(Application).find(applicationId) || !useRepo(Contact).find(contactId)) {
    throw new ContactLinkError('contact')
  }
  const links = useRepo(ApplicationContact).where('applicationId', applicationId).where('contactId', contactId)
  if (0 < links.get().length) {
    throw new ContactLinkError('twice')
  }
  return useRepo(ApplicationContact).save({ applicationId, contactId, role })
}

// The applications a person is linked to.
export function applicationsOfContact(contactId: string): Application[] {
  const ids = useRepo(ApplicationContact)
    .where('contactId', contactId)
    .get()
    .map((link) => link.applicationId)
  return useRepo(Application)
    .with('jobOffer', (query) => query.with('company'))
    .whereIn('id', ids)
    .get()
}

// The people who are linked to an application, and could be linked to another.
export const candidatesFor = (applicationId: string): Contact[] => {
  const linked = new Set(
    useRepo(ApplicationContact)
      .where('applicationId', applicationId)
      .get()
      .map((link) => link.contactId)
  )
  return useRepo(Contact)
    .all()
    .filter((contact) => !linked.has(contact.id))
}
