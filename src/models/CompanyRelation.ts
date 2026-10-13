import { Model } from 'pinia-orm'
import Company from './Company'

// How a company is tied to another. Two kinds are stored, each in one direction; the opposite is told from the other side:
//   recruits_for    - "from" is a recruitment firm (or an agency) that hires for "to", the final client;
//   subsidiary_of   - "from" belongs to "to" (so "to" is the parent of "from", which is not stored a second time).
export const RELATION_KINDS = ['recruits_for', 'subsidiary_of'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]

export default class CompanyRelation extends Model {
  static entity = 'companyRelations'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare fromId: string
  declare toId: string
  declare kind: RelationKind

  declare from: Company | null
  declare to: Company | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      fromId: this.attr(''),
      toId: this.attr(''),
      kind: this.string('recruits_for'),
      from: this.belongsTo(Company, 'fromId'),
      to: this.belongsTo(Company, 'toId'),
    }
  }
}
