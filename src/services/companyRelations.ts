import { useRepo } from 'pinia-orm'
import { Company, CompanyRelation } from '../models'
import { RELATION_KINDS, type RelationKind } from '../models/CompanyRelation'
import { findOrCreateCompany } from './applications'

// A relation that cannot be saved. The code is the key of the message to show.
export class RelationError extends Error {
  constructor(public readonly code: 'kind' | 'missing' | 'itself' | 'twice' | 'loop') {
    super(code)
  }
}

// The companies "from" is tied to by that kind (one step).
function targets(fromId: string, kind: RelationKind): string[] {
  return useRepo(CompanyRelation)
    .where('fromId', fromId)
    .where('kind', kind)
    .get()
    .map((relation) => relation.toId)
}

// Whether following the relations of a kind from `start` leads to `goal`: a relation that would close the circle is refused
// (a firm that recruits for a client that recruits for the firm, a company that is its own ancestor).
function reaches(start: string, goal: string, kind: RelationKind, seen = new Set<string>()): boolean {
  if (start === goal) {
    return true
  }
  if (seen.has(start)) {
    return false
  }
  seen.add(start)
  return targets(start, kind).some((next) => reaches(next, goal, kind, seen))
}

function connect(fromId: string, kind: string, toId: string): CompanyRelation {
  if (!(RELATION_KINDS as readonly string[]).includes(kind)) {
    throw new RelationError('kind')
  }
  if (!useRepo(Company).find(fromId) || !useRepo(Company).find(toId)) {
    throw new RelationError('missing')
  }
  if (toId === fromId) {
    throw new RelationError('itself')
  }
  if (targets(fromId, kind as RelationKind).includes(toId)) {
    throw new RelationError('twice')
  }
  if (reaches(toId, fromId, kind as RelationKind)) {
    throw new RelationError('loop')
  }
  return useRepo(CompanyRelation).save({ fromId, toId, kind })
}

/**
 * Ties a company to another one, by the name of the other (found, or created when it is new).
 *
 * - `recruits_for`: the company is a recruitment firm that hires for the other one, the final client.
 * - `subsidiary_of`: the company belongs to the other one.
 *
 * A company cannot be tied to itself, the same relation is kept once, and a relation that would close a circle is refused.
 * Nothing is created when the relation is refused.
 */
export function addRelation(fromId: string, kind: string, otherName: string): CompanyRelation {
  if ('' === otherName.trim()) {
    throw new RelationError('missing')
  }
  // A relation that cannot be saved must not leave a new company behind.
  const existing = useRepo(Company)
    .all()
    .find((company) => company.name.trim().toLowerCase() === otherName.trim().toLowerCase())
  if (!existing) {
    if (!(RELATION_KINDS as readonly string[]).includes(kind) || !useRepo(Company).find(fromId)) {
      throw new RelationError(RELATION_KINDS.includes(kind as RelationKind) ? 'missing' : 'kind')
    }
  }
  return connect(fromId, kind, (existing ?? findOrCreateCompany(otherName)).id)
}

export function removeRelation(relationId: string) {
  useRepo(CompanyRelation).destroy(relationId)
}

// A relation as told from one of its two companies: "recruits for X" or "is recruited by X", "subsidiary of X" or "parent of X".
export type RelationView = 'recruits_for' | 'recruited_by' | 'subsidiary_of' | 'parent_of'

export interface CompanyLink {
  relationId: string
  view: RelationView
  other: Company
}

const OTHER_SIDE: Record<RelationKind, RelationView> = {
  recruits_for: 'recruited_by',
  subsidiary_of: 'parent_of',
}

export const RELATION_VIEWS: readonly RelationView[] = ['recruits_for', 'recruited_by', 'subsidiary_of', 'parent_of']

/**
 * Ties a company to another one as it is told from that company: "recruits for X", "is recruited by X", "subsidiary of X",
 * "parent of X". The two that look the other way are stored in the direction of the kind, from the other company.
 */
export function addLink(companyId: string, view: string, otherName: string): CompanyRelation {
  if (!(RELATION_VIEWS as readonly string[]).includes(view)) {
    throw new RelationError('kind')
  }
  const turned = 'recruited_by' === view || 'parent_of' === view
  const kind = 'recruits_for' === view || 'recruited_by' === view ? 'recruits_for' : 'subsidiary_of'
  if (!turned) {
    return addRelation(companyId, kind, otherName)
  }
  const company = useRepo(Company).find(companyId)
  if (!company || '' === otherName.trim()) {
    throw new RelationError('missing')
  }
  const other = useRepo(Company)
    .all()
    .find((candidate) => candidate.name.trim().toLowerCase() === otherName.trim().toLowerCase())
  // The company that tells is the one the relation points to: a name that is new is made only if the relation holds.
  return other ? connect(other.id, kind, companyId) : addRelation(findOrCreateCompany(otherName).id, kind, company.name)
}

// Everything a company is tied to, from its own point of view.
export function linksOf(companyId: string): CompanyLink[] {
  const relations = useRepo(CompanyRelation).with('from').with('to').get()
  return relations.flatMap((relation): CompanyLink[] => {
    if (relation.fromId === companyId && relation.to) {
      return [{ relationId: relation.id, view: relation.kind, other: relation.to }]
    }
    if (relation.toId === companyId && relation.from) {
      return [{ relationId: relation.id, view: OTHER_SIDE[relation.kind], other: relation.from }]
    }
    return []
  })
}

// The final clients of a recruitment firm: the companies it recruits for.
export const finalClientsOf = (companyId: string): Company[] =>
  linksOf(companyId)
    .filter((link) => 'recruits_for' === link.view)
    .map((link) => link.other)

// A company that is deleted takes its relations with it.
export function removeRelationsOf(companyId: string) {
  useRepo(CompanyRelation).where('fromId', companyId).delete()
  useRepo(CompanyRelation).where('toId', companyId).delete()
}
