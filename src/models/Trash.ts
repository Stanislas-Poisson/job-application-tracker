import { Model } from 'pinia-orm'

// A record that was deleted, kept as it was for a while. It tells what was deleted and when (so that a merge of two
// computers can tell a deletion from a record that is missing), and lets the user take it back.
export default class Trash extends Model {
  static entity = 'trash'

  declare id: string
  // The kind of data (an entity name: applications, contacts…) and the id the record had.
  declare entity: string
  declare recordId: string
  // The record as it was, ready to be put back.
  declare record: Record<string, unknown>
  declare deletedAt: string
  // Records deleted together (an application and its notes) share a batch and come back together.
  declare batch: string

  static fields() {
    return {
      id: this.uid(),
      entity: this.string(''),
      recordId: this.string(''),
      record: this.attr({}),
      deletedAt: this.string(() => new Date().toISOString()),
      batch: this.string(''),
    }
  }
}
