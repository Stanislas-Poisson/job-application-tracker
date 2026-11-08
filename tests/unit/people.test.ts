import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ApplicationContact,
  Company,
  Contact,
  ContactCompany,
  ContactMethod,
  Interaction,
  Note,
  Taggable,
} from '../../src/models'
import { addContact, addNote, captureOffer } from '../../src/services/applications'
import { ContactError } from '../../src/services/contacts'
import { addInteraction } from '../../src/services/interactions'
import { createContact, deleteContact, updateContact } from '../../src/services/people'
import { tagEntityByName } from '../../src/services/tags'
import { freshStore } from './helpers'

describe('the people', () => {
  beforeEach(() => {
    freshStore()
  })

  describe('a contact made on its own', () => {
    it('has no application, and keeps its fields and its ways to reach it in their canonical forms', () => {
      const contact = createContact({
        firstName: ' Ada ',
        lastName: 'Lovelace',
        role: 'Recruiter',
        email: 'Ada@Example.COM',
        country: 'fr',
        languages: ['fr', 'en-gb'],
      })
      expect(contact).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', role: 'Recruiter', country: 'FR' })
      expect(contact.languages).toEqual(['fr', 'en-GB'])
      expect(useRepo(ContactMethod).where('contactId', contact.id).get()[0]).toMatchObject({
        type: 'email',
        value: 'ada@example.com',
        isPrimary: true,
      })
      expect(useRepo(ApplicationContact).where('contactId', contact.id).get()).toHaveLength(0)
    })

    it('works for a company that exists, found whatever its case, or for a new one that is made', () => {
      captureOffer({ title: 'Dev', companyName: 'Acme' })
      const known = createContact({ firstName: 'Ada', lastName: 'L', company: ' acme ' })
      expect(useRepo(Company).all()).toHaveLength(1)
      expect(known.companyId).toBe(useRepo(Company).first()?.id)
      const fresh = createContact({ firstName: 'Grace', lastName: 'H', company: 'Brand New Co' })
      expect(useRepo(Company).all()).toHaveLength(2)
      expect(useRepo(ContactCompany).where('contactId', fresh.id).get()).toHaveLength(1)
    })

    it('needs a name, and a refused contact leaves nothing behind', () => {
      expect(() => createContact({ firstName: ' ', lastName: '', company: 'Ghost Inc' })).toThrow(ContactError)
      expect(useRepo(Contact).all()).toHaveLength(0)
      expect(useRepo(Company).all()).toHaveLength(0)
    })
  })

  describe('changing a contact', () => {
    it('changes what it says of itself, and the rest of it stays', () => {
      const contact = createContact({ firstName: 'Ada', lastName: 'L', email: 'ada@example.com' })
      updateContact(contact.id, { firstName: 'Ada', lastName: 'Lovelace', role: 'CTO', country: 'GB', languages: [] })
      expect(useRepo(Contact).find(contact.id)).toMatchObject({ lastName: 'Lovelace', role: 'CTO', country: 'GB' })
      expect(useRepo(ContactMethod).where('contactId', contact.id).get()).toHaveLength(1)
    })

    it('refuses a contact with no name and a country that is not known', () => {
      const contact = createContact({ firstName: 'Ada', lastName: 'L' })
      expect(() => updateContact(contact.id, { firstName: '', lastName: '' })).toThrow(ContactError)
      expect(() => updateContact(contact.id, { firstName: 'Ada', lastName: 'L', country: 'XX' })).toThrow(ContactError)
      expect(useRepo(Contact).find(contact.id)?.lastName).toBe('L')
    })
  })

  describe('removing a contact', () => {
    it('removes what only made sense with it, keeps the exchanges, and does not touch the others', () => {
      const application = captureOffer({ title: 'Dev', companyName: 'Acme' })
      const gone = addContact(application.id, { firstName: 'Ada', lastName: 'L', email: 'ada@example.com' })
      const kept = addContact(application.id, { firstName: 'Grace', lastName: 'H' })
      addNote('contacts', gone.id, 'a note')
      tagEntityByName('contacts', gone.id, 'friend')
      addInteraction({
        applicationId: application.id,
        contactId: gone.id,
        channel: 'email',
        direction: 'inbound',
        subject: 'Hello',
        occurredAt: '2026-10-15T09:00:00Z',
      })

      deleteContact(gone.id)

      expect(useRepo(Contact).find(gone.id)).toBeNull()
      expect(useRepo(ContactMethod).where('contactId', gone.id).get()).toHaveLength(0)
      expect(useRepo(ContactCompany).where('contactId', gone.id).get()).toHaveLength(0)
      expect(useRepo(ApplicationContact).where('contactId', gone.id).get()).toHaveLength(0)
      expect(useRepo(Note).where('noteableId', gone.id).get()).toHaveLength(0)
      expect(useRepo(Taggable).where('taggableId', gone.id).get()).toHaveLength(0)
      expect(useRepo(Interaction).all()).toHaveLength(1)
      expect(useRepo(Interaction).first()?.contactId).toBeNull()
      expect(useRepo(Contact).find(kept.id)).not.toBeNull()
    })
  })
})
