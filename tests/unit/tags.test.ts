import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Company, Contact, Interaction, Tag, Taggable } from '../../src/models'
import { addContact, captureOffer, deleteApplication } from '../../src/services/applications'
import { addInteraction } from '../../src/services/interactions'
import {
  TagError,
  createTag,
  deleteTag,
  recolorTag,
  renameTag,
  setPriority,
  tagEntity,
  tagEntityByName,
  tagUsage,
  toggleFavorite,
  untagEntity,
} from '../../src/services/tags'
import { freshStore } from './helpers'

const codeOf = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    return error instanceof TagError ? error.code : 'other'
  }
  return null
}

describe('tags', () => {
  let applicationId: string
  let companyId: string
  let contactId: string

  beforeEach(() => {
    freshStore()
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    applicationId = application.id
    companyId = useRepo(Company).first()?.id ?? ''
    contactId = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace' }).id
  })

  it('makes a tag with a colour, and gives the next ones different colours', () => {
    const first = createTag('remote')
    const second = createTag('startup')

    expect(first.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(second.color).not.toBe(first.color)
  })

  it('takes the colour that is given, in lower case', () => {
    expect(createTag('urgent', '#D55E00').color).toBe('#d55e00')
    expect(codeOf(() => createTag('x', 'red'))).toBe('color')
  })

  it('keeps one tag for names that differ by the case or the spaces', () => {
    const first = createTag('Remote')
    const second = createTag('  remote ')

    expect(second.id).toBe(first.id)
    expect(useRepo(Tag).all()).toHaveLength(1)
  })

  it('refuses an empty name', () => {
    expect(codeOf(() => createTag('   '))).toBe('name')
  })

  it('renames a tag, but not to the name of another', () => {
    const remote = createTag('remote')
    createTag('startup')

    renameTag(remote.id, 'télétravail')
    expect(useRepo(Tag).find(remote.id)?.name).toBe('télétravail')
    expect(codeOf(() => renameTag(remote.id, 'Startup'))).toBe('name')
    expect(codeOf(() => renameTag(remote.id, ' '))).toBe('name')
  })

  it('changes the colour of a tag', () => {
    const tag = createTag('remote')
    recolorTag(tag.id, '#009E73')

    expect(useRepo(Tag).find(tag.id)?.color).toBe('#009e73')
    expect(codeOf(() => recolorTag(tag.id, 'green'))).toBe('color')
  })

  it('puts a tag on an application, a company, a contact and an exchange, and reads them back', () => {
    const exchange = addInteraction({
      applicationId,
      channel: 'email',
      direction: 'inbound',
      subject: 'Hi',
      occurredAt: '2026-10-12T14:30:00.000Z',
    })
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)
    tagEntity('companies', companyId, tag.id)
    tagEntity('contacts', contactId, tag.id)
    tagEntity('interactions', exchange.id, tag.id)

    expect(
      useRepo(Application)
        .with('tags')
        .find(applicationId)
        ?.tags.map((entry) => entry.name)
    ).toEqual(['important'])
    expect(useRepo(Company).with('tags').find(companyId)?.tags).toHaveLength(1)
    expect(useRepo(Contact).with('tags').find(contactId)?.tags).toHaveLength(1)
    expect(useRepo(Interaction).with('tags').find(exchange.id)?.tags).toHaveLength(1)
    expect(tagUsage(tag.id)).toBe(4)
  })

  it('does not mix the tags of two things that have the same id kind', () => {
    const other = captureOffer({ title: 'Two', companyName: 'Globex' }).id
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)

    expect(useRepo(Application).with('tags').find(other)?.tags).toHaveLength(0)
  })

  it('puts a tag once, however many times it is put', () => {
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)
    tagEntity('applications', applicationId, tag.id)

    expect(useRepo(Taggable).all()).toHaveLength(1)
  })

  it('puts a tag by its name, and makes it when it does not exist', () => {
    tagEntityByName('applications', applicationId, 'Remote')
    tagEntityByName('applications', applicationId, ' remote ')

    expect(useRepo(Tag).all()).toHaveLength(1)
    expect(useRepo(Taggable).all()).toHaveLength(1)
  })

  it('takes a tag off, and keeps the tag and the other things that carry it', () => {
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)
    tagEntity('companies', companyId, tag.id)
    untagEntity('applications', applicationId, tag.id)

    expect(useRepo(Application).with('tags').find(applicationId)?.tags).toHaveLength(0)
    expect(useRepo(Tag).find(tag.id)).not.toBeNull()
    expect(tagUsage(tag.id)).toBe(1)
  })

  it('refuses a thing or a tag that does not exist', () => {
    const tag = createTag('important')

    expect(codeOf(() => tagEntity('applications', 'nope', tag.id))).toBe('target')
    expect(codeOf(() => tagEntity('applications', applicationId, 'nope'))).toBe('tag')
  })

  it('removes a tag with the links that put it on things, and leaves the things', () => {
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)
    tagEntity('companies', companyId, tag.id)
    deleteTag(tag.id)

    expect(useRepo(Tag).all()).toHaveLength(0)
    expect(useRepo(Taggable).all()).toHaveLength(0)
    expect(useRepo(Application).find(applicationId)).not.toBeNull()
    expect(useRepo(Company).find(companyId)).not.toBeNull()
  })

  it('removes the links of an application and of its exchanges when the application is deleted', () => {
    const exchange = addInteraction({
      applicationId,
      channel: 'email',
      direction: 'inbound',
      subject: 'Hi',
      occurredAt: '2026-10-12T14:30:00.000Z',
    })
    const tag = createTag('important')
    tagEntity('applications', applicationId, tag.id)
    tagEntity('interactions', exchange.id, tag.id)
    tagEntity('companies', companyId, tag.id)
    deleteApplication(applicationId)

    expect(useRepo(Interaction).all()).toHaveLength(0)
    expect(
      useRepo(Taggable)
        .all()
        .map((link) => link.taggableType)
    ).toEqual(['companies'])
  })
})

describe('favourites and priority', () => {
  let applicationId: string
  let companyId: string
  let contactId: string

  beforeEach(() => {
    freshStore()
    applicationId = captureOffer({ title: 'One', companyName: 'Acme' }).id
    companyId = useRepo(Company).first()?.id ?? ''
    contactId = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace' }).id
  })

  it('turns the star of an application, a company and a contact on and off', () => {
    expect(toggleFavorite('applications', applicationId)).toBe(true)
    expect(toggleFavorite('companies', companyId)).toBe(true)
    expect(toggleFavorite('contacts', contactId)).toBe(true)
    expect(useRepo(Application).find(applicationId)?.isFavorite).toBe(true)
    expect(useRepo(Contact).find(contactId)?.isFavorite).toBe(true)

    expect(toggleFavorite('applications', applicationId)).toBe(false)
    expect(useRepo(Application).find(applicationId)?.isFavorite).toBe(false)
  })

  it('has no favourite and no priority to begin with', () => {
    expect(useRepo(Application).find(applicationId)).toMatchObject({ isFavorite: false, priority: 0 })
  })

  it('sets a priority from none to high, and refuses another', () => {
    setPriority(applicationId, 3)
    expect(useRepo(Application).find(applicationId)?.priority).toBe(3)
    expect(codeOf(() => setPriority(applicationId, 4))).toBe('priority')
    expect(codeOf(() => setPriority(applicationId, 1.5))).toBe('priority')
    expect(codeOf(() => setPriority('nope', 1))).toBe('target')
  })
})
