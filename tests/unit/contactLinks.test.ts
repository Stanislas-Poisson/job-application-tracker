import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Company, Contact, ContactCompany } from '../../src/models'
import { addContact, captureOffer, unlinkContact } from '../../src/services/applications'
import {
  ContactLinkError,
  addCompanyLink,
  applicationsOfContact,
  candidatesFor,
  companiesOf,
  endCompanyLink,
  linkContact,
  removeCompanyLink,
  syncMainCompany,
} from '../../src/services/contactLinks'
import { freshStore } from './helpers'

const failsWith = (code: string, action: () => unknown) => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(ContactLinkError)
    expect((error as ContactLinkError).code).toBe(code)
    return
  }
  throw new Error(`Expected a ContactLinkError (${code}).`)
}

const names = (contactId: string) => companiesOf(contactId).map((link) => link.company?.name)
const main = (contactId: string) => useRepo(Contact).find(contactId)?.companyId ?? null
const companyId = (name: string) =>
  useRepo(Company)
    .all()
    .find((company) => company.name === name)?.id ?? null

describe('the companies of a person', () => {
  beforeEach(() => {
    freshStore()
  })

  it('starts with the company of the offer the person was met for', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace', role: 'Recruiter' })

    expect(names(contact.id)).toEqual(['Hire Co'])
    expect(companiesOf(contact.id)[0]?.title).toBe('Recruiter')
    expect(main(contact.id)).toBe(companyId('Hire Co'))
  })

  it('adds other companies, with a title and a period, by name', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    const link = addCompanyLink(contact.id, 'Talent Bureau', { title: 'Partner', startedOn: '2024-03-01' })

    expect(link).toMatchObject({ title: 'Partner', startedOn: '2024-03-01', endedOn: null })
    expect(names(contact.id).sort()).toEqual(['Hire Co', 'Talent Bureau'])
    expect(useRepo(Company).all()).toHaveLength(2)
    // A name that is known is found whatever its case.
    addCompanyLink(contact.id, '  hire CO ', { startedOn: '2020-01-01' })
    expect(useRepo(Company).all()).toHaveLength(2)
  })

  it('puts the ones the person works for now first, the latest start first, then the ones left', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'First' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    removeCompanyLink(companiesOf(contact.id)[0]?.id ?? '')

    addCompanyLink(contact.id, 'Old', { startedOn: '2015-01-01', endedOn: '2018-12-31' })
    addCompanyLink(contact.id, 'Older', { startedOn: '2010-01-01', endedOn: '2014-06-30' })
    addCompanyLink(contact.id, 'Recent', { startedOn: '2023-05-01' })
    addCompanyLink(contact.id, 'Current', { startedOn: '2021-02-01' })
    addCompanyLink(contact.id, 'No date')

    expect(names(contact.id)).toEqual(['Recent', 'Current', 'No date', 'Old', 'Older'])
  })

  it('keeps the main company in step with the list', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    expect(main(contact.id)).toBe(companyId('Hire Co'))

    // A newer job is the main company; leaving it gives the place back.
    const newer = addCompanyLink(contact.id, 'Talent Bureau', { startedOn: '2024-03-01' })
    expect(main(contact.id)).toBe(companyId('Talent Bureau'))
    endCompanyLink(newer.id, '2025-01-31')
    expect(main(contact.id)).toBe(companyId('Hire Co'))

    // Nothing left to work for: the one left last is the main one.
    const first = companiesOf(contact.id).find((link) => 'Hire Co' === link.company?.name)
    endCompanyLink(first?.id ?? '', '2025-06-30')
    expect(names(contact.id)).toContain('Hire Co')
    expect(main(contact.id)).toBe(companyId('Hire Co'))

    // No company at all.
    companiesOf(contact.id).forEach((link) => removeCompanyLink(link.id))
    expect(main(contact.id)).toBeNull()
  })

  it('refuses a missing name, a date that is not one, a last day before the first, and the same link twice', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })

    failsWith('company', () => addCompanyLink(contact.id, '   '))
    failsWith('date', () => addCompanyLink(contact.id, 'X', { startedOn: '2024-02-30' }))
    failsWith('date', () => addCompanyLink(contact.id, 'X', { endedOn: 'yesterday' }))
    failsWith('order', () => addCompanyLink(contact.id, 'X', { startedOn: '2024-05-01', endedOn: '2024-04-30' }))
    addCompanyLink(contact.id, 'Y', { startedOn: '2024-05-01' })
    failsWith('twice', () => addCompanyLink(contact.id, 'y', { startedOn: '2024-05-01' }))
    // The same company from another day is another job.
    expect(() => addCompanyLink(contact.id, 'Y', { startedOn: '2026-01-01' })).not.toThrow()
    failsWith('contact', () => addCompanyLink('nobody', 'X'))
  })

  it('does not make a company when the link is refused', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    failsWith('order', () =>
      addCompanyLink(contact.id, 'Brand New', { startedOn: '2024-05-01', endedOn: '2024-04-30' })
    )
    failsWith('date', () => addCompanyLink(contact.id, 'Brand New', { startedOn: 'x' }))
    expect(companyId('Brand New')).toBeNull()
  })

  it('refuses a last day before the first when a person leaves', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    const link = addCompanyLink(contact.id, 'Y', { startedOn: '2024-05-01' })
    failsWith('order', () => endCompanyLink(link.id, '2024-04-01'))
    failsWith('date', () => endCompanyLink(link.id, 'soon'))
    failsWith('contact', () => endCompanyLink('nothing', '2024-06-01'))
    endCompanyLink(link.id, '2024-06-01')
    expect(useRepo(ContactCompany).find(link.id)?.endedOn).toBe('2024-06-01')
  })

  it('does not fail on a person with no link', () => {
    const contact = useRepo(Contact).save({ firstName: 'Lone', lastName: 'Wolf' })
    expect(companiesOf(contact.id)).toEqual([])
    syncMainCompany(contact.id)
    expect(main(contact.id)).toBeNull()
  })
})

describe('the applications of a person', () => {
  beforeEach(() => {
    freshStore()
  })

  it('links a person who is known to another application, and lists them from the person', () => {
    const one = captureOffer({ title: 'One', companyName: 'Acme' })
    const two = captureOffer({ title: 'Two', companyName: 'Globex' })
    const contact = addContact(one.id, { firstName: 'Ada', lastName: 'Lovelace' })

    expect(applicationsOfContact(contact.id).map((application) => application.jobOffer?.title)).toEqual(['One'])
    expect(candidatesFor(two.id).map((candidate) => candidate.id)).toEqual([contact.id])

    linkContact(two.id, contact.id, 'recruiter')
    expect(
      applicationsOfContact(contact.id)
        .map((application) => application.jobOffer?.title)
        .sort()
    ).toEqual(['One', 'Two'])
    expect(candidatesFor(two.id)).toEqual([])
  })

  it('refuses the same link twice and a person or an application that is not there', () => {
    const one = captureOffer({ title: 'One', companyName: 'Acme' })
    const contact = addContact(one.id, { firstName: 'Ada', lastName: 'Lovelace' })
    failsWith('twice', () => linkContact(one.id, contact.id))
    failsWith('contact', () => linkContact('nothing', contact.id))
    failsWith('contact', () => linkContact(one.id, 'nobody'))
  })

  it('keeps the person when one link is taken off', () => {
    const one = captureOffer({ title: 'One', companyName: 'Acme' })
    const two = captureOffer({ title: 'Two', companyName: 'Globex' })
    const contact = addContact(one.id, { firstName: 'Ada', lastName: 'Lovelace' })
    linkContact(two.id, contact.id)

    unlinkContact(one.id, contact.id)
    expect(applicationsOfContact(contact.id).map((application) => application.jobOffer?.title)).toEqual(['Two'])
    expect(useRepo(Contact).find(contact.id)).not.toBeNull()
  })

  it('gives no application to a person with none', () => {
    const contact = useRepo(Contact).save({ firstName: 'Lone', lastName: 'Wolf' })
    expect(applicationsOfContact(contact.id)).toEqual([])
  })
})
