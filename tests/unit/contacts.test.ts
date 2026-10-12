import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Contact, ContactMethod } from '../../src/models'
import { addContact, captureOffer } from '../../src/services/applications'
import { ContactError, normalizeContactInput } from '../../src/services/contacts'
import { freshStore } from './helpers'

const codeOf = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    return error instanceof ContactError ? error.code : 'other'
  }
  return null
}

const base = { firstName: 'Ada', lastName: 'Lovelace' }

describe('the fields of a contact', () => {
  it('puts everything in its canonical form', () => {
    expect(
      normalizeContactInput(
        {
          ...base,
          role: ' Recruiter ',
          email: ' ADA@Example.com ',
          phone: '06 12 34 56 78',
          linkedin: 'linkedin.com/in/Ada-Lovelace/',
          country: 'fr',
          timeZone: 'Europe/Paris',
          languages: ['FR-ca', 'en', 'fr-CA', ''],
        },
        {}
      )
    ).toEqual({
      fields: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'Recruiter',
        country: 'FR',
        timeZone: 'Europe/Paris',
        languages: ['fr-CA', 'en'],
      },
      methods: [
        { type: 'email', value: 'ada@example.com', label: null, isPrimary: true },
        { type: 'phone', value: '+33612345678', label: null, isPrimary: true },
        { type: 'linkedin', value: 'https://www.linkedin.com/in/ada-lovelace', label: null, isPrimary: true },
      ],
    })
  })

  it('has nothing for what is empty', () => {
    const { fields, methods } = normalizeContactInput({ ...base, email: '  ', phone: '', linkedin: null }, {})

    expect(fields).toMatchObject({ role: null, country: null, timeZone: null, languages: [] })
    expect(methods).toEqual([])
  })

  it('reads a national phone number in the country of the person first, then in the default country', () => {
    expect(
      normalizeContactInput({ ...base, phone: '020 7946 0958', country: 'GB' }, { defaultCountry: 'FR' }).methods[0]
        ?.value
    ).toBe('+442079460958')
    expect(
      normalizeContactInput({ ...base, phone: '06 12 34 56 78' }, { defaultCountry: 'FR' }).methods[0]?.value
    ).toBe('+33612345678')
  })

  it('wants a name', () => {
    expect(codeOf(() => normalizeContactInput({ firstName: ' ', lastName: '' }, {}))).toBe('name')
    expect(codeOf(() => normalizeContactInput({ firstName: 'Ada', lastName: '' }, {}))).toBeNull()
  })

  it.each([
    ['email', { email: 'nope' }],
    ['phone', { phone: '123' }],
    ['phone', { phone: '06 12 34 56 78' }],
    ['linkedin', { linkedin: 'https://example.com/ada' }],
    ['country', { country: 'Atlantis' }],
    ['timeZone', { timeZone: 'Mars/Olympus' }],
    ['language', { languages: ['not a tag!'] }],
  ])('refuses a bad %s', (code, extra) => {
    expect(codeOf(() => normalizeContactInput({ ...base, ...extra }, {}))).toBe(code)
  })
})

describe('adding a contact', () => {
  beforeEach(() => {
    freshStore()
  })

  it('saves the canonical forms', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    const contact = addContact(
      application.id,
      { ...base, phone: '06 12 34 56 78', email: 'ADA@example.com' },
      'recruiter',
      {
        defaultCountry: 'FR',
      }
    )

    const methods = useRepo(ContactMethod).where('contactId', contact.id).get()
    expect(methods.map((method) => [method.type, method.value, method.isPrimary])).toEqual([
      ['email', 'ada@example.com', true],
      ['phone', '+33612345678', true],
    ])
  })

  it('saves nothing when a field is wrong', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })

    expect(codeOf(() => addContact(application.id, { ...base, email: 'nope' }))).toBe('email')
    expect(useRepo(Contact).all()).toHaveLength(0)
  })
})
