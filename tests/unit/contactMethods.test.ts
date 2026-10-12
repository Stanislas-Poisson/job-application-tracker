import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Contact, ContactMethod } from '../../src/models'
import { addContact, captureOffer } from '../../src/services/applications'
import {
  addContactMethod,
  removeContactMethod,
  setPrimaryMethod,
  sortedMethods,
} from '../../src/services/contactMethods'
import { ContactError, normalizeMethod, withPrimaries } from '../../src/services/contacts'
import { normalizeWebsite } from '../../src/utils/contact'
import { freshStore } from './helpers'

const codeOf = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    return error instanceof ContactError ? error.code : 'other'
  }
  return null
}

describe('a way to reach a person', () => {
  it.each([
    [{ type: 'email', value: ' ADA@Example.COM ' }, 'ada@example.com'],
    [{ type: 'phone', value: '06 12 34 56 78' }, '+33612345678'],
    [{ type: 'linkedin', value: 'fr.linkedin.com/in/Ada/' }, 'https://www.linkedin.com/in/ada'],
    [{ type: 'website', value: 'Example.com/about#team' }, 'https://example.com/about'],
    [{ type: 'other', value: '  @ada on Matrix ' }, '@ada on Matrix'],
  ] as const)('%j is kept as %s', (input, value) => {
    expect(normalizeMethod(input, { defaultCountry: 'FR' }).value).toBe(value)
  })

  it('refuses a value that is not of its type', () => {
    expect(codeOf(() => normalizeMethod({ type: 'email', value: 'nope' }))).toBe('email')
    expect(codeOf(() => normalizeMethod({ type: 'phone', value: '123' }, { defaultCountry: 'FR' }))).toBe('phone')
    expect(codeOf(() => normalizeMethod({ type: 'linkedin', value: 'https://example.com' }))).toBe('linkedin')
    expect(codeOf(() => normalizeMethod({ type: 'website', value: 'not a site' }))).toBe('website')
    expect(codeOf(() => normalizeMethod({ type: 'other', value: '  ' }))).toBe('method')
  })

  it('keeps the label', () => {
    expect(normalizeMethod({ type: 'email', value: 'a@b.co', label: ' work ' }).label).toBe('work')
    expect(normalizeMethod({ type: 'email', value: 'a@b.co', label: '  ' }).label).toBeNull()
  })

  it('knows a website', () => {
    expect(normalizeWebsite('https://example.com')).toBe('https://example.com')
    expect(normalizeWebsite('example.com')).toBe('https://example.com')
    expect(normalizeWebsite('http://Example.com/Path?a=1#x')).toBe('http://example.com/Path?a=1')
    for (const text of ['', 'localhost', 'ftp://example.com', 'javascript:alert(1)', 'a b.com']) {
      expect(normalizeWebsite(text)).toBeNull()
    }
  })
})

describe('the main way of each type', () => {
  const method = (type: 'email' | 'phone', value: string, isPrimary = false) => ({
    type,
    value,
    label: null,
    isPrimary,
  })

  it('is the first of the type when none is marked', () => {
    const result = withPrimaries([
      method('email', 'a@b.co'),
      method('email', 'c@d.co'),
      method('phone', '+33612345678'),
    ])
    expect(result.map((entry) => entry.isPrimary)).toEqual([true, false, true])
  })

  it('is the one that is marked, and only one when several are', () => {
    const result = withPrimaries([
      method('email', 'a@b.co'),
      method('email', 'c@d.co', true),
      method('email', 'e@f.co', true),
    ])
    expect(result.map((entry) => entry.isPrimary)).toEqual([false, true, false])
  })
})

describe('the ways to reach a contact', () => {
  let contactId: string
  let applicationId: string

  beforeEach(() => {
    freshStore()
    applicationId = captureOffer({ title: 'One', companyName: 'Acme' }).id
    contactId = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace', country: 'FR' }).id
  })

  const methods = () => useRepo(ContactMethod).where('contactId', contactId).get()

  it('makes the first of a type its main one', () => {
    addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'email', value: 'c@d.co', label: 'home' })

    expect(methods().map((method) => [method.value, method.isPrimary])).toEqual([
      ['a@b.co', true],
      ['c@d.co', false],
    ])
  })

  it('lets a way that is marked take the place of the main one', () => {
    addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'email', value: 'c@d.co', primary: true })

    expect(methods().map((method) => [method.value, method.isPrimary])).toEqual([
      ['a@b.co', false],
      ['c@d.co', true],
    ])
  })

  it('does not mix the main ways of two types', () => {
    addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'phone', value: '06 12 34 56 78' })

    expect(methods().filter((method) => method.isPrimary)).toHaveLength(2)
  })

  it('does not add the same value twice', () => {
    addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'email', value: ' A@B.co ' })

    expect(methods()).toHaveLength(1)
  })

  it('reads a phone number in the country of the contact', () => {
    // The contact is in France: a national number is a French one, whatever the default country is.
    addContactMethod(contactId, { type: 'phone', value: '06 12 34 56 78' }, { defaultCountry: 'US' })

    expect(methods()[0]?.value).toBe('+33612345678')
  })

  it('saves nothing for a value that is not valid', () => {
    expect(codeOf(() => addContactMethod(contactId, { type: 'email', value: 'nope' }))).toBe('email')
    expect(methods()).toHaveLength(0)
  })

  it('makes another way the main one', () => {
    const first = addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    const second = addContactMethod(contactId, { type: 'email', value: 'c@d.co' })
    setPrimaryMethod(second.id)

    expect(useRepo(ContactMethod).find(first.id)?.isPrimary).toBe(false)
    expect(useRepo(ContactMethod).find(second.id)?.isPrimary).toBe(true)
  })

  it('gives the main place to the oldest that is left when the main one is removed', () => {
    const first = addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'email', value: 'c@d.co' })
    addContactMethod(contactId, { type: 'email', value: 'e@f.co' })
    removeContactMethod(first.id)

    expect(methods().map((method) => [method.value, method.isPrimary])).toEqual([
      ['c@d.co', true],
      ['e@f.co', false],
    ])
  })

  it('goes away with nothing left when the only way is removed', () => {
    const only = addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    removeContactMethod(only.id)

    expect(methods()).toHaveLength(0)
    expect(useRepo(Contact).find(contactId)).not.toBeNull()
  })

  it('sorts by type, the main one first', () => {
    addContactMethod(contactId, { type: 'phone', value: '06 12 34 56 78' })
    addContactMethod(contactId, { type: 'email', value: 'a@b.co' })
    addContactMethod(contactId, { type: 'email', value: 'c@d.co', primary: true })

    expect(sortedMethods(methods()).map((method) => method.value)).toEqual(['c@d.co', 'a@b.co', '+33612345678'])
  })
})
