import type { CountryCode } from 'libphonenumber-js/min'
import { useRepo } from 'pinia-orm'
import { ApplicationContact, Contact, ContactCompany, ContactMethod, Interaction, Note, Taggable } from '../models'
import { addCompanyLink } from './contactLinks'
import { type ContactInput, normalizeContactInput } from './contacts'

// What a form of a contact holds: the fields of the person, and the company they work for, found by its name or made.
export interface PersonInput extends ContactInput {
  company?: string
}

/**
 * Makes a contact on its own, with no application: its fields in their canonical forms, its ways to reach it, and the company it
 * works for when there is one (found by its name, or made). It can be linked to applications afterwards. An invalid field throws a
 * ContactError and nothing is saved.
 */
export function createContact(input: PersonInput, options: { defaultCountry?: CountryCode } = {}): Contact {
  const { fields, methods } = normalizeContactInput(input, options)
  const contact = useRepo(Contact).save({ ...fields, companyId: null })
  for (const method of methods) {
    useRepo(ContactMethod).save({ ...method, contactId: contact.id })
  }
  if ('' !== (input.company ?? '').trim()) {
    addCompanyLink(contact.id, input.company ?? '', { title: contact.role ?? undefined })
  }
  return useRepo(Contact).find(contact.id) ?? contact
}

/**
 * Changes what a contact says of itself (name, role, country, time zone, languages). It follows everywhere, as the applications,
 * the exchanges and the companies point at the person. The ways to reach them and their companies are edited on their own.
 */
export function updateContact(
  id: string,
  input: Pick<ContactInput, 'firstName' | 'lastName' | 'role' | 'country' | 'timeZone' | 'languages'>
): Contact {
  const current = useRepo(Contact).find(id)
  if (!current) {
    throw new Error(`No contact ${id}`)
  }
  const { fields } = normalizeContactInput(input)
  return useRepo(Contact).save({ ...current.$getAttributes(), ...fields })
}

/**
 * Removes a contact, and what only made sense with it: its ways to reach it, its places of work, its links with applications, its
 * notes and its tags. The exchanges stay (they happened) but name nobody any more.
 */
export function deleteContact(id: string): void {
  if (!useRepo(Contact).find(id)) {
    throw new Error(`No contact ${id}`)
  }
  useRepo(ContactMethod).where('contactId', id).delete()
  useRepo(ContactCompany).where('contactId', id).delete()
  useRepo(ApplicationContact).where('contactId', id).delete()
  useRepo(Note).where('noteableType', 'contacts').where('noteableId', id).delete()
  useRepo(Taggable).where('taggableType', 'contacts').where('taggableId', id).delete()
  useRepo(Interaction).where('contactId', id).update({ contactId: null })
  useRepo(Contact).destroy(id)
}
