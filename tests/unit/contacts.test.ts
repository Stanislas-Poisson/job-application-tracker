import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Contact } from '../../src/models'
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
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'Recruiter',
      email: 'ada@example.com',
      phone: '+33612345678',
      linkedin: 'https://www.linkedin.com/in/ada-lovelace',
      country: 'FR',
      timeZone: 'Europe/Paris',
      languages: ['fr-CA', 'en'],
    })
  })

  it('has nothing for what is empty', () => {
    expect(normalizeContactInput({ ...base, email: '  ', phone: '', linkedin: null }, {})).toMatchObject({
      role: null,
      email: null,
      phone: null,
      linkedin: null,
      country: null,
      timeZone: null,
      languages: [],
    })
  })

  it('reads a national phone number in the country of the person first, then in the default country', () => {
    expect(
      normalizeContactInput({ ...base, phone: '020 7946 0958', country: 'GB' }, { defaultCountry: 'FR' }).phone
    ).toBe('+442079460958')
    expect(normalizeContactInput({ ...base, phone: '06 12 34 56 78' }, { defaultCountry: 'FR' }).phone).toBe(
      '+33612345678'
    )
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

    expect(useRepo(Contact).find(contact.id)).toMatchObject({ phone: '+33612345678', email: 'ada@example.com' })
  })

  it('saves nothing when a field is wrong', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })

    expect(codeOf(() => addContact(application.id, { ...base, email: 'nope' }))).toBe('email')
    expect(useRepo(Contact).all()).toHaveLength(0)
  })
})
