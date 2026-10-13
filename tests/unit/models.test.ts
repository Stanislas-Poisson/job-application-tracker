import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Company, Contact, JobOffer, MODELS, Note, Source, Status } from '../../src/models'
import { DEFAULT_SOURCES, DEFAULT_STATUSES } from '../../src/services/seed'
import { freshStore } from './helpers'

describe('models', () => {
  beforeEach(() => {
    freshStore()
  })

  it('has fifteen models, each with its own entity name', () => {
    const entities = MODELS.map((model) => model.entity)
    expect(entities).toHaveLength(15)
    expect(new Set(entities).size).toBe(15)
  })

  it('starts with the default statuses in order and the default sources', () => {
    const statuses = useRepo(Status).orderBy('order').get()
    expect(statuses.map((status) => status.key)).toEqual(DEFAULT_STATUSES.map((status) => status.key))
    expect(useRepo(Source).all()).toHaveLength(DEFAULT_SOURCES.length)
  })

  it('does not seed again over what exists', async () => {
    const { seedDefaults } = await import('../../src/services/seed')
    useRepo(Status).where('key', 'applied').update({ label: 'Sent' })
    seedDefaults()
    expect(useRepo(Status).all()).toHaveLength(DEFAULT_STATUSES.length)
    expect(useRepo(Status).where('key', 'applied').first()?.label).toBe('Sent')
  })

  it('links a company to its offers and an offer to its applications', () => {
    const company = useRepo(Company).save({ name: 'Acme' })
    const offer = useRepo(JobOffer).save({ companyId: company.id, title: 'Developer' })
    useRepo(Application).save({ jobOfferId: offer.id })

    const loaded = useRepo(Company)
      .with('offers', (query) => query.with('applications'))
      .find(company.id)
    expect(loaded?.offers).toHaveLength(1)
    expect(loaded?.offers[0]?.applications).toHaveLength(1)
  })

  it('links contacts to applications through the pivot, from both sides', async () => {
    const { ApplicationContact } = await import('../../src/models')
    const application = useRepo(Application).save({})
    const contact = useRepo(Contact).save({ firstName: 'Ada', lastName: 'Lovelace' })
    useRepo(ApplicationContact).save({ applicationId: application.id, contactId: contact.id, role: 'recruiter' })

    expect(useRepo(Application).with('contacts').find(application.id)?.contacts).toHaveLength(1)
    expect(useRepo(Contact).with('applications').find(contact.id)?.applications).toHaveLength(1)
  })

  it('keeps notes of different owners apart', () => {
    const company = useRepo(Company).save({ name: 'Acme' })
    const application = useRepo(Application).save({})
    useRepo(Note).save({ noteableType: 'companies', noteableId: company.id, body: 'about the company' })
    useRepo(Note).save({ noteableType: 'applications', noteableId: application.id, body: 'about the application' })

    expect(
      useRepo(Company)
        .with('notes')
        .find(company.id)
        ?.notes.map((note) => note.body)
    ).toEqual(['about the company'])
    expect(
      useRepo(Application)
        .with('notes')
        .find(application.id)
        ?.notes.map((note) => note.body)
    ).toEqual(['about the application'])
  })
})
