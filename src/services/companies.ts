import { useRepo } from 'pinia-orm'
import { Company, CompanyRelation, Contact, ContactCompany, JobOffer, Note, Taggable } from '../models'
import { isCountry, normalizeWebsite } from '../utils/contact'
import { nfc, sameText } from '../utils/text'
import { syncMainCompany } from './contactLinks'

// A change to a company that cannot be made. The code is the key of the message to show.
export class CompanyError extends Error {
  constructor(public readonly code: 'missing' | 'name' | 'duplicate' | 'website' | 'country' | 'inUse' | 'itself') {
    super(code)
  }
}

export interface CompanyInput {
  name: string
  website: string
  city: string
  country: string
  sector: string
}

const orNull = (value: string): string | null => ('' === value.trim() ? null : nfc(value.trim()))

// What the form of a company holds, from the company.
export const companyInput = (company: Company): CompanyInput => ({
  name: company.name,
  website: company.website ?? '',
  city: company.city ?? '',
  country: company.country ?? '',
  sector: company.sector ?? '',
})

/**
 * Changes what a company says of itself. This is the one place where it is changed, and it follows everywhere: the offers, the
 * contacts and the links that name the company show the new name at once, as they point at the company and not at a text.
 * A name that another company already has (whatever the case and the accents) is refused: the two are the same company, and
 * merging them is what says so.
 */
export function updateCompany(id: string, input: CompanyInput): Company {
  const company = useRepo(Company).find(id)
  if (!company) {
    throw new CompanyError('missing')
  }
  const name = nfc(input.name.trim())
  if ('' === name) {
    throw new CompanyError('name')
  }
  if (
    useRepo(Company)
      .all()
      .some((other) => other.id !== id && sameText(other.name, name))
  ) {
    throw new CompanyError('duplicate')
  }
  const website = '' === input.website.trim() ? null : normalizeWebsite(input.website)
  if ('' !== input.website.trim() && null === website) {
    throw new CompanyError('website')
  }
  const country = input.country.trim().toUpperCase()
  if ('' !== country && !isCountry(country)) {
    throw new CompanyError('country')
  }
  return useRepo(Company).save({
    ...company.$getAttributes(),
    name,
    website,
    city: orNull(input.city),
    country: '' === country ? null : country,
    sector: orNull(input.sector),
  })
}

// How many applications there are for the offers of a company.
export function offersOf(companyId: string): JobOffer[] {
  return useRepo(JobOffer).with('applications').where('companyId', companyId).get()
}

/**
 * Makes two companies one: everything that named `dropId` names `keepId` (its offers, the people who work there, the links with
 * other companies, its notes and its tags), then `dropId` goes. A link that would then say a company is tied to itself, or that
 * the other company already has, is not kept twice.
 */
export function mergeCompanies(keepId: string, dropId: string): void {
  if (keepId === dropId) {
    throw new CompanyError('itself')
  }
  if (!useRepo(Company).find(keepId) || !useRepo(Company).find(dropId)) {
    throw new CompanyError('missing')
  }

  useRepo(JobOffer).where('companyId', dropId).update({ companyId: keepId })

  // A person who works for both keeps one link, the one with the most to say (the one of the company kept).
  const contactIds = new Set<string>()
  for (const link of useRepo(ContactCompany).where('companyId', dropId).get()) {
    contactIds.add(link.contactId)
    const already = useRepo(ContactCompany)
      .where('contactId', link.contactId)
      .where('companyId', keepId)
      .where('startedOn', link.startedOn)
      .first()
    if (already) {
      useRepo(ContactCompany).destroy(link.id)
    } else {
      useRepo(ContactCompany).where('id', link.id).update({ companyId: keepId })
    }
  }
  useRepo(Contact).where('companyId', dropId).update({ companyId: keepId })
  for (const contactId of contactIds) {
    syncMainCompany(contactId)
  }

  // The links between companies: pointed at the company kept, without a company tied to itself or the same link twice.
  for (const relation of [
    ...useRepo(CompanyRelation).where('fromId', dropId).get(),
    ...useRepo(CompanyRelation).where('toId', dropId).get(),
  ]) {
    const fromId = relation.fromId === dropId ? keepId : relation.fromId
    const toId = relation.toId === dropId ? keepId : relation.toId
    const twice = useRepo(CompanyRelation)
      .where('fromId', fromId)
      .where('toId', toId)
      .where('kind', relation.kind)
      .get()
      .some((other) => other.id !== relation.id)
    if (fromId === toId || twice) {
      useRepo(CompanyRelation).destroy(relation.id)
    } else {
      useRepo(CompanyRelation).where('id', relation.id).update({ fromId, toId })
    }
  }

  useRepo(Note).where('noteableType', 'companies').where('noteableId', dropId).update({ noteableId: keepId })
  for (const tagging of useRepo(Taggable).where('taggableType', 'companies').where('taggableId', dropId).get()) {
    const already = useRepo(Taggable)
      .where('taggableType', 'companies')
      .where('taggableId', keepId)
      .where('tagId', tagging.tagId)
      .first()
    if (already) {
      useRepo(Taggable).destroy(tagging.id)
    } else {
      useRepo(Taggable).where('id', tagging.id).update({ taggableId: keepId })
    }
  }

  useRepo(Company).destroy(dropId)
}

/**
 * Removes a company that has no offer left. What only made sense with it goes too: its links with other companies, the places
 * where people work for it, its notes and its tags. The people stay.
 */
export function deleteCompany(id: string): void {
  if (!useRepo(Company).find(id)) {
    throw new CompanyError('missing')
  }
  if (0 < useRepo(JobOffer).where('companyId', id).get().length) {
    throw new CompanyError('inUse')
  }
  const contactIds = useRepo(ContactCompany)
    .where('companyId', id)
    .get()
    .map((link) => link.contactId)
  useRepo(ContactCompany).where('companyId', id).delete()
  useRepo(Contact).where('companyId', id).update({ companyId: null })
  for (const contactId of contactIds) {
    syncMainCompany(contactId)
  }
  useRepo(CompanyRelation).where('fromId', id).delete()
  useRepo(CompanyRelation).where('toId', id).delete()
  useRepo(Note).where('noteableType', 'companies').where('noteableId', id).delete()
  useRepo(Taggable).where('taggableType', 'companies').where('taggableId', id).delete()
  useRepo(Company).destroy(id)
}
