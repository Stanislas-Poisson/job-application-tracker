import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Company, CompanyRelation, Contact, ContactCompany, JobOffer, Note, Taggable } from '../../src/models'
import { addContact, addNote, captureOffer } from '../../src/services/applications'
import {
  CompanyError,
  companyInput,
  deleteCompany,
  mergeCompanies,
  offersOf,
  updateCompany,
} from '../../src/services/companies'
import { addRelation } from '../../src/services/companyRelations'
import { addCompanyLink, companiesOf } from '../../src/services/contactLinks'
import { tagEntityByName } from '../../src/services/tags'
import { freshStore } from './helpers'

const failsWith = (code: string, action: () => unknown) => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyError)
    expect((error as CompanyError).code).toBe(code)
    return
  }
  throw new Error(`Expected a CompanyError (${code}).`)
}

const company = (name: string) =>
  useRepo(Company)
    .all()
    .find((candidate) => candidate.name === name)

describe('the companies', () => {
  beforeEach(() => {
    freshStore()
  })

  describe('changing what a company says of itself', () => {
    it('renames it once, and the offers that name it show the new name', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      const acme = company('Acme')
      expect(acme).toBeDefined()
      updateCompany(acme?.id ?? '', { ...companyInput(acme as Company), name: 'Acme Corp' })
      expect(useRepo(JobOffer).with('company').first()?.company?.name).toBe('Acme Corp')
      expect(useRepo(Company).all()).toHaveLength(1)
    })

    it('keeps the website as an address, the country as a code, and drops what is left empty', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      const id = company('Acme')?.id ?? ''
      updateCompany(id, { name: 'Acme', website: 'acme.example.com', city: ' Lyon ', country: 'fr', sector: '' })
      const saved = useRepo(Company).find(id)
      expect(saved?.website).toBe('https://acme.example.com')
      expect(saved?.city).toBe('Lyon')
      expect(saved?.country).toBe('FR')
      expect(saved?.sector).toBeNull()
    })

    it('refuses an empty name, a name another company has (case and accents aside), a bad website and a bad country', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      captureOffer({ title: 'Dev', companyName: 'Société Générale' })
      const acme = company('Acme') as Company
      const base = companyInput(acme)
      failsWith('name', () => updateCompany(acme.id, { ...base, name: '   ' }))
      failsWith('duplicate', () => updateCompany(acme.id, { ...base, name: 'societe generale' }))
      failsWith('website', () => updateCompany(acme.id, { ...base, website: 'not a website' }))
      failsWith('country', () => updateCompany(acme.id, { ...base, country: 'XX' }))
      failsWith('missing', () => updateCompany('nothing', base))
      expect(company('Acme')?.name).toBe('Acme')
    })

    it('lets a company keep its own name in another case', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      const acme = company('Acme') as Company
      updateCompany(acme.id, { ...companyInput(acme), name: 'ACME' })
      expect(useRepo(Company).find(acme.id)?.name).toBe('ACME')
    })
  })

  describe('merging two companies', () => {
    it('gives the offers, the people, the links, the notes and the tags of one to the other, and removes it', () => {
      const first = captureOffer({ title: 'Dev', companyName: 'Acme' })
      captureOffer({ title: 'Ops', companyName: 'ACME Inc' })
      captureOffer({ title: 'Lead', companyName: 'Big Client' })
      const keep = company('Acme') as Company
      const drop = company('ACME Inc') as Company
      const client = company('Big Client') as Company

      const person = addContact(first.id, { firstName: 'Ada', lastName: 'Lovelace' })
      addCompanyLink(person.id, 'ACME Inc', { title: 'Recruiter' })
      addRelation(drop.id, 'recruits_for', 'Big Client')
      addNote('companies', drop.id, 'A note about the old name')
      tagEntityByName('companies', drop.id, 'startup')

      mergeCompanies(keep.id, drop.id)

      expect(useRepo(Company).find(drop.id)).toBeNull()
      expect(
        offersOf(keep.id)
          .map((offer) => offer.title)
          .sort()
      ).toEqual(['Dev', 'Ops'])
      expect(companiesOf(person.id).map((link) => link.companyId)).toEqual([keep.id])
      expect(useRepo(Contact).find(person.id)?.companyId).toBe(keep.id)
      const relations = useRepo(CompanyRelation).all()
      expect(relations).toHaveLength(1)
      expect([relations[0]?.fromId, relations[0]?.toId]).toEqual([keep.id, client.id])
      expect(useRepo(Note).where('noteableId', keep.id).get()).toHaveLength(1)
      expect(useRepo(Taggable).where('taggableId', keep.id).get()).toHaveLength(1)
    })

    it('does not keep a link twice, or a company tied to itself', () => {
      const application = captureOffer({ title: 'Dev', companyName: 'Acme' })
      captureOffer({ title: 'Ops', companyName: 'Acme Group' })
      const keep = company('Acme') as Company
      const drop = company('Acme Group') as Company
      addRelation(keep.id, 'subsidiary_of', 'Acme Group')
      const person = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
      // The person was met for the offer of Acme: they work for it, and for the group too.
      addCompanyLink(person.id, 'Acme Group')

      mergeCompanies(keep.id, drop.id)

      expect(useRepo(CompanyRelation).all()).toHaveLength(0)
      expect(useRepo(ContactCompany).where('contactId', person.id).get()).toHaveLength(1)
    })

    it('refuses to merge a company into itself, or one that is not there', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      const acme = company('Acme') as Company
      failsWith('itself', () => mergeCompanies(acme.id, acme.id))
      failsWith('missing', () => mergeCompanies(acme.id, 'nothing'))
    })
  })

  describe('removing a company', () => {
    it('refuses while it has an offer', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      failsWith('inUse', () => deleteCompany(company('Acme')?.id ?? ''))
      expect(company('Acme')).toBeDefined()
    })

    it('removes one with no offer, with what only made sense with it, and keeps the people', () => {
      const application = captureOffer({ title: 'Dev', companyName: 'Acme' })
      const empty = addRelation(company('Acme')?.id ?? '', 'recruits_for', 'Left Alone').toId
      const person = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
      addCompanyLink(person.id, 'Left Alone')
      addNote('companies', empty, 'A note')
      tagEntityByName('companies', empty, 'startup')

      deleteCompany(empty)

      expect(useRepo(Company).find(empty)).toBeNull()
      expect(useRepo(CompanyRelation).all()).toHaveLength(0)
      expect(useRepo(ContactCompany).where('companyId', empty).get()).toHaveLength(0)
      expect(useRepo(Contact).find(person.id)).not.toBeNull()
      // The person still works for Acme, which was the company of the offer: it is their main one again.
      expect(useRepo(Contact).find(person.id)?.companyId).toBe(company('Acme')?.id)
      expect(useRepo(Note).where('noteableId', empty).get()).toHaveLength(0)
      expect(useRepo(Taggable).where('taggableId', empty).get()).toHaveLength(0)
    })

    it('says so when the company is not there', () => {
      failsWith('missing', () => deleteCompany('nothing'))
    })
  })
})
