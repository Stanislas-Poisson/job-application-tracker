import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Company, CompanyRelation } from '../../src/models'
import { captureOffer, findOrCreateCompany } from '../../src/services/applications'
import { searchableText } from '../../src/services/boardQuery'
import {
  RelationError,
  addLink,
  addRelation,
  finalClientsOf,
  linksOf,
  removeRelation,
  removeRelationsOf,
} from '../../src/services/companyRelations'
import { freshStore } from './helpers'

const company = (name: string) => findOrCreateCompany(name)
const names = (companies: Company[]) => companies.map((candidate) => candidate.name).sort()
const failsWith = (code: string, action: () => unknown) => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(RelationError)
    expect((error as RelationError).code).toBe(code)
    return
  }
  throw new Error(`Expected a RelationError (${code}).`)
}

describe('company relations', () => {
  beforeEach(() => {
    freshStore()
  })

  it('ties a recruitment firm to its final client, by the name of the client', () => {
    const firm = company('Hire Co')
    const relation = addRelation(firm.id, 'recruits_for', 'Big Bank')

    expect(relation.kind).toBe('recruits_for')
    expect(useRepo(Company).all()).toHaveLength(2)
    expect(names(finalClientsOf(firm.id))).toEqual(['Big Bank'])
  })

  it('finds the other company whatever its case, instead of making a second one', () => {
    const firm = company('Hire Co')
    company('Big Bank')
    addRelation(firm.id, 'recruits_for', '  BIG bank ')
    expect(useRepo(Company).all()).toHaveLength(2)
  })

  it('tells a relation from both sides', () => {
    const firm = company('Hire Co')
    const client = company('Big Bank')
    addRelation(firm.id, 'recruits_for', 'Big Bank')
    addRelation(client.id, 'subsidiary_of', 'Mega Group')

    expect(linksOf(firm.id).map((link) => [link.view, link.other.name])).toEqual([['recruits_for', 'Big Bank']])
    expect(
      linksOf(client.id)
        .map((link) => [link.view, link.other.name])
        .sort()
    ).toEqual([
      ['recruited_by', 'Hire Co'],
      ['subsidiary_of', 'Mega Group'],
    ])
    const group = useRepo(Company)
      .all()
      .find((candidate) => 'Mega Group' === candidate.name)
    expect(linksOf(group?.id ?? '').map((link) => [link.view, link.other.name])).toEqual([['parent_of', 'Big Bank']])
    // Only the recruitment firm has final clients.
    expect(finalClientsOf(client.id)).toEqual([])
  })

  it('stores the two kinds in one direction, and the other two views in the opposite one', () => {
    const client = company('Big Bank')
    addLink(client.id, 'recruited_by', 'Hire Co')
    addLink(client.id, 'parent_of', 'Small Branch')

    const relations = useRepo(CompanyRelation).with('from').with('to').get()
    expect(relations.map((relation) => `${relation.from?.name} ${relation.kind} ${relation.to?.name}`).sort()).toEqual([
      'Hire Co recruits_for Big Bank',
      'Small Branch subsidiary_of Big Bank',
    ])
    expect(
      linksOf(client.id)
        .map((link) => link.view)
        .sort()
    ).toEqual(['parent_of', 'recruited_by'])
  })

  it('refuses a company tied to itself, a link made twice, and a kind that is not known', () => {
    const firm = company('Hire Co')
    failsWith('itself', () => addRelation(firm.id, 'recruits_for', 'hire co'))
    addRelation(firm.id, 'recruits_for', 'Big Bank')
    failsWith('twice', () => addRelation(firm.id, 'recruits_for', 'Big Bank'))
    failsWith('kind', () => addRelation(firm.id, 'friend_of', 'Big Bank'))
    failsWith('kind', () => addLink(firm.id, 'friend_of', 'Big Bank'))
    failsWith('missing', () => addRelation(firm.id, 'recruits_for', '   '))
    failsWith('missing', () => addRelation('nobody', 'recruits_for', 'Big Bank'))
    expect(useRepo(CompanyRelation).all()).toHaveLength(1)
  })

  it('allows the same two companies to be tied in two different ways', () => {
    const firm = company('Hire Co')
    addRelation(firm.id, 'recruits_for', 'Big Bank')
    expect(() => addRelation(firm.id, 'subsidiary_of', 'Big Bank')).not.toThrow()
  })

  it('refuses a link that would close a circle', () => {
    const a = company('A')
    addRelation(a.id, 'subsidiary_of', 'B')
    const b = findOrCreateCompany('B')
    addRelation(b.id, 'subsidiary_of', 'C')
    const c = findOrCreateCompany('C')

    failsWith('loop', () => addRelation(c.id, 'subsidiary_of', 'A'))
    failsWith('loop', () => addRelation(b.id, 'subsidiary_of', 'A'))
    failsWith('loop', () => addLink(a.id, 'parent_of', 'C'))
    // Another kind has its own circles: this one is not one.
    expect(() => addRelation(c.id, 'recruits_for', 'A')).not.toThrow()
  })

  it('does not leave a company behind when the link is refused', () => {
    const firm = company('Hire Co')
    failsWith('kind', () => addRelation(firm.id, 'friend_of', 'Brand New'))
    failsWith('missing', () => addRelation('nobody', 'recruits_for', 'Brand New'))
    expect(
      useRepo(Company)
        .all()
        .map((candidate) => candidate.name)
    ).toEqual(['Hire Co'])
  })

  it('removes a link, and the links of a company with it', () => {
    const firm = company('Hire Co')
    const link = addRelation(firm.id, 'recruits_for', 'Big Bank')
    addRelation(firm.id, 'recruits_for', 'Other Bank')
    removeRelation(link.id)
    expect(names(finalClientsOf(firm.id))).toEqual(['Other Bank'])

    removeRelationsOf(firm.id)
    expect(useRepo(CompanyRelation).all()).toHaveLength(0)
  })

  it('makes the search find an offer by its final client', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const offer = useRepo(Company)
      .all()
      .find((candidate) => 'Hire Co' === candidate.name)
    if (offer) addRelation(offer.id, 'recruits_for', 'Big Bank')
    const loaded = useRepo(Company).all()
    expect(loaded).toHaveLength(2)

    const withOffer = useRepo(Application)
      .with('jobOffer', (query) => query.with('company'))
      .find(application.id)
    expect(searchableText(withOffer as never)).not.toContain('big bank')
    expect(searchableText(withOffer as never, (id) => linksOf(id).map((link) => link.other.name))).toContain('big bank')
  })
})
