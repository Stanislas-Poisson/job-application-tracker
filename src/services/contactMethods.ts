import type { CountryCode } from 'libphonenumber-js/min'
import { useRepo } from 'pinia-orm'
import { Contact, ContactMethod } from '../models'
import { type MethodInput, normalizeMethod } from './contacts'

// Adds a way to reach a contact. The first of a type is its main one, and a way marked as main takes the place of the
// one that was. The same value of the same type twice is not added again.
export function addContactMethod(
  contactId: string,
  input: MethodInput,
  options: { defaultCountry?: CountryCode } = {}
) {
  const contact = useRepo(Contact).find(contactId)
  if (!contact) {
    throw new Error(`No contact ${contactId}`)
  }
  const method = normalizeMethod(input, {
    defaultCountry: options.defaultCountry,
    country: (contact.country as CountryCode | null) ?? null,
  })

  const sameType = useRepo(ContactMethod).where('contactId', contactId).where('type', method.type).get()
  const existing = sameType.find((other) => other.value === method.value)
  if (existing) {
    return existing
  }

  const primary = method.isPrimary || 0 === sameType.length
  if (primary) {
    sameType.forEach((other) => useRepo(ContactMethod).where('id', other.id).update({ isPrimary: false }))
  }
  return useRepo(ContactMethod).save({ ...method, contactId, isPrimary: primary })
}

// Makes a way the main one of its type, and the others of that type not.
export function setPrimaryMethod(methodId: string) {
  const method = useRepo(ContactMethod).find(methodId)
  if (!method) {
    return
  }
  useRepo(ContactMethod)
    .where('contactId', method.contactId)
    .where('type', method.type)
    .get()
    .forEach((other) =>
      useRepo(ContactMethod)
        .where('id', other.id)
        .update({ isPrimary: other.id === methodId })
    )
}

// Removes a way. When it was the main one, the oldest that is left of its type becomes the main one.
export function removeContactMethod(methodId: string) {
  const method = useRepo(ContactMethod).find(methodId)
  if (!method) {
    return
  }
  useRepo(ContactMethod).destroy(methodId)
  if (method.isPrimary) {
    const next = useRepo(ContactMethod)
      .where('contactId', method.contactId)
      .where('type', method.type)
      .orderBy('createdAt')
      .first()
    if (next) {
      useRepo(ContactMethod).where('id', next.id).update({ isPrimary: true })
    }
  }
}

// The ways to reach a contact, the main ones first, then by type.
export function sortedMethods(methods: ContactMethod[]): ContactMethod[] {
  const order = ['email', 'phone', 'linkedin', 'website', 'other']
  return [...methods].sort(
    (a, b) =>
      order.indexOf(a.type) - order.indexOf(b.type) ||
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.createdAt.localeCompare(b.createdAt)
  )
}
